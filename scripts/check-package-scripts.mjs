#!/usr/bin/env node
/**
 * Package-scripts gate: `pnpm lint`, `pnpm typecheck` and `pnpm test` are
 * `turbo run <task>`, and turbo silently SKIPS a workspace package that does
 * not define the script. A package without `lint` therefore falls out of
 * every ESLint gate and complexity/max-lines budget while `pnpm lint` stays
 * green — the fail-open that kept both client packages unlinted until an
 * ESLint error had already landed there (#333).
 *
 * Every workspace package with a `src/` directory must define `lint` (ESLint
 * over src), `typecheck` (tsc) and `test` (vitest). Packages without `src/`
 * (the docs site) carry no source the gates could cover.
 *
 * Runs as `pnpm lint:package-scripts` (chained into the root `pnpm lint`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The scripts every source package must define, each with the command it must
 * actually run — `"lint": "true"` would satisfy turbo and lint nothing.
 */
export const REQUIRED_SCRIPTS = {
  lint: { pattern: /\beslint\b[^&|;]*\bsrc\b/, expect: "eslint over src" },
  typecheck: { pattern: /\btsc\b/, expect: "tsc" },
  test: { pattern: /\bvitest\b/, expect: "vitest" },
}

/** Violations for one package.json's `scripts` block (pure; unit-tested). */
export function checkPackageScripts(dir, scripts) {
  const errors = []
  for (const [name, { pattern, expect }] of Object.entries(REQUIRED_SCRIPTS)) {
    const command = scripts?.[name]
    if (typeof command !== "string" || command.trim() === "") {
      errors.push(
        `${dir}: missing "${name}" script — turbo skips the package, so \`pnpm ${name}\` ` +
          `never covers its src/ (expected: ${expect})`,
      )
    } else if (!pattern.test(command)) {
      errors.push(`${dir}: "${name}" script is "${command}" — expected it to run ${expect}`)
    }
  }
  return errors
}

/** The `packages:` globs of pnpm-workspace.yaml (plain list form). */
export function workspaceGlobs(yamlText) {
  const globs = []
  let inPackages = false
  for (const line of yamlText.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages) {
      const item = /^\s+-\s+["']?([^"'#\s]+)["']?/.exec(line)
      if (item) globs.push(item[1])
      else if (/^\S/.test(line)) break
    }
  }
  return globs
}

/** Expand `a/*` / `a/*\/*` / `docs` style workspace globs into package dirs. */
export function expandWorkspaceGlobs(root, globs) {
  const dirs = []
  for (const glob of globs) {
    let current = [""]
    for (const segment of glob.split("/")) {
      const next = []
      for (const base of current) {
        const abs = path.join(root, base)
        if (segment === "*") {
          if (!existsSync(abs)) continue
          for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== "node_modules") {
              next.push(path.posix.join(base, entry.name))
            }
          }
        } else if (existsSync(path.join(abs, segment))) {
          next.push(path.posix.join(base, segment))
        }
      }
      current = next
    }
    dirs.push(...current.filter((dir) => existsSync(path.join(root, dir, "package.json"))))
  }
  return [...new Set(dirs)].sort()
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const globs = workspaceGlobs(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8"))
  if (globs.length === 0) {
    console.error("check-package-scripts: no workspace globs found in pnpm-workspace.yaml")
    process.exit(1)
  }
  const errors = []
  let checked = 0
  for (const dir of expandWorkspaceGlobs(root, globs)) {
    if (!existsSync(path.join(root, dir, "src"))) continue
    checked += 1
    const { scripts } = JSON.parse(readFileSync(path.join(root, dir, "package.json"), "utf8"))
    errors.push(...checkPackageScripts(dir, scripts))
  }
  if (errors.length > 0) {
    console.error("Workspace packages missing required scripts:\n")
    for (const error of errors) console.error(`  - ${error}`)
    console.error(
      "\nAdd the script instead of excluding the package: a source package outside " +
        "`turbo run lint|typecheck|test` is invisible to every gate (CLAUDE.md, Verification).",
    )
    process.exit(1)
  }
  console.log(`Package scripts: all ${checked} source packages define lint, typecheck and test.`)
}
