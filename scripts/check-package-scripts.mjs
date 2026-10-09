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
 * over src), `typecheck` (tsc) and `test` (vitest), each in its CANONICAL
 * shape: a command that merely mentions the tool can still switch its gate
 * off (`vitest run --coverage.enabled=false`, `eslint src || true`,
 * `eslint src --rule 'complexity: off'`). `typecheck` must cover every extra
 * `tsconfig.<x>.json` project of the package (the widget/UI/test sources only
 * those projects type-check), and a package with a stryker.config.json must
 * run the plain `stryker run` (the mutation diff gate appends its own scope).
 * Packages without `src/` (the docs site) carry no source the gates could
 * cover. An EXISTING package's gate scripts are additionally pinned to the
 * merge base by scripts/check-ratchets.mjs.
 *
 * Runs as `pnpm lint:package-scripts` (chained into the root `pnpm lint`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The scripts every source package must define, each anchored to the command
 * it must actually run — no flags, no shell operators: `"lint": "true"` would
 * satisfy turbo and lint nothing, and so would `"lint": "eslint src || true"`.
 */
export const REQUIRED_SCRIPTS = {
  lint: {
    pattern: /^eslint src(?: \w[\w-]*)*$/,
    expect: "`eslint src` (further source dirs allowed; no flags or shell operators)",
  },
  typecheck: {
    pattern: /^tsc --noEmit(?: && tsc -p tsconfig\.[\w-]+\.json)*$/,
    expect: "`tsc --noEmit`, then `&& tsc -p tsconfig.<x>.json` per extra project",
  },
  test: {
    pattern: /^vitest run$/,
    expect:
      "`vitest run` (a flag such as --coverage.enabled=false switches the package's coverage ratchet off)",
  },
}

const MUTATION_SCRIPT = "stryker run"

/** Whitespace-normalized command, or undefined when absent/empty. */
const normalizedCommand = (command) =>
  typeof command === "string" && command.trim() !== ""
    ? command.trim().replace(/\s+/g, " ")
    : undefined

/**
 * Violations for one package.json's `scripts` block (pure; unit-tested).
 * `tsconfigs`: the package's extra `tsconfig.<x>.json` files; `hasStryker`:
 * whether it carries a stryker.config.json.
 */
export function checkPackageScripts(dir, scripts, { tsconfigs = [], hasStryker = false } = {}) {
  const errors = []
  for (const [name, { pattern, expect }] of Object.entries(REQUIRED_SCRIPTS)) {
    const command = normalizedCommand(scripts?.[name])
    if (command === undefined) {
      errors.push(
        `${dir}: missing "${name}" script — turbo skips the package, so \`pnpm ${name}\` ` +
          `never covers its src/ (expected: ${expect})`,
      )
    } else if (!pattern.test(command)) {
      errors.push(`${dir}: "${name}" script is "${command}" — expected it to run ${expect}`)
    }
  }
  const typecheck = normalizedCommand(scripts?.typecheck) ?? ""
  for (const tsconfig of tsconfigs) {
    if (!typecheck.split(" && ").includes(`tsc -p ${tsconfig}`)) {
      errors.push(
        `${dir}: "typecheck" does not run \`tsc -p ${tsconfig}\` — the sources only that ` +
          `project covers (widgets, UI, tests) would go unchecked`,
      )
    }
  }
  if (hasStryker) {
    const command = normalizedCommand(scripts?.["test:mutation"])
    if (command === undefined) {
      errors.push(
        `${dir}: missing "test:mutation" script — the package has a stryker.config.json ` +
          `(expected: \`${MUTATION_SCRIPT}\`)`,
      )
    } else if (command !== MUTATION_SCRIPT) {
      errors.push(
        `${dir}: "test:mutation" script is "${command}" — expected it to run \`${MUTATION_SCRIPT}\`: ` +
          `the diff gate appends --mutate/--incrementalFile, and any other argument (a config ` +
          `path, a lax option) changes what the gate measures`,
      )
    }
  }
  return errors
}

/** The extra `tsconfig.<x>.json` projects in a package directory. */
function extraTsconfigs(abs) {
  return readdirSync(abs)
    .filter((name) => /^tsconfig\.[\w-]+\.json$/.test(name))
    .sort()
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
    const abs = path.join(root, dir)
    if (!existsSync(path.join(abs, "src"))) continue
    checked += 1
    const { scripts } = JSON.parse(readFileSync(path.join(abs, "package.json"), "utf8"))
    errors.push(
      ...checkPackageScripts(dir, scripts, {
        tsconfigs: extraTsconfigs(abs),
        hasStryker: existsSync(path.join(abs, "stryker.config.json")),
      }),
    )
  }
  if (errors.length > 0) {
    console.error("Workspace packages with missing or non-canonical gate scripts:\n")
    for (const error of errors) console.error(`  - ${error}`)
    console.error(
      "\nAdd the script instead of excluding the package: a source package outside " +
        "`turbo run lint|typecheck|test` is invisible to every gate (CLAUDE.md, Verification).",
    )
    process.exit(1)
  }
  console.log(
    `Package scripts: all ${checked} source packages run the canonical lint, typecheck and test (and test:mutation where Stryker is configured).`,
  )
}
