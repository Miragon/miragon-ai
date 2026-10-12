import fs from "node:fs"
import path from "node:path"
import { builtinModules } from "node:module"
import { describe, expect, it } from "vitest"
import { REPO_ROOT } from "./source-scan.js"

/**
 * A published package's shipped source imports only what its manifest makes
 * the consumer install: `dependencies` or `peerDependencies` (#345, N176).
 * knip's unlisted check counts `devDependencies` as listed, so a widget that
 * imports a dev-only package builds here and breaks in a consumer that does
 * not happen to hoist it.
 */

interface Manifest {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function publishedPackages(): Array<{ dir: string; manifest: Manifest }> {
  const children = (dir: string) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name))
  const packages = path.join(REPO_ROOT, "packages")
  return [
    ...children(path.join(packages, "core")),
    ...children(path.join(packages, "connectors")).flatMap(children),
  ]
    .filter((dir) => fs.existsSync(path.join(dir, "package.json")))
    .map((dir) => ({
      dir,
      manifest: JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as Manifest,
    }))
    .filter(({ manifest }) => !manifest.private)
}

// Shipped means every source a consumer receives, minus tests and the
// generated SDK (whose imports are the client's own `dependencies`).
const isShipped = (rel: string) =>
  /\.tsx?$/.test(rel) &&
  !/\.test\.tsx?$|\.test-support\.tsx?$/.test(rel) &&
  !rel.split(path.sep).some((part) => part === "test-support")

/**
 * The bare package names a module imports: statements and `import("…")`.
 * Comments that open a line are dropped first (a `/*` inside a string, like a
 * glob, is no comment).
 */
function importedPackages(source: string): string[] {
  const code = source.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "")
  const specifiers = [
    ...code.matchAll(/^\s*(?:import|export)\b[^;"]*?\bfrom\s*"([^"]+)"/gm),
    ...code.matchAll(/^\s*import\s*"([^"]+)"/gm),
    ...code.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g),
  ].map((match) => match[1] ?? "")
  return specifiers
    .filter(
      (spec) =>
        !spec.startsWith(".") && !spec.startsWith("node:") && !builtinModules.includes(spec),
    )
    .map((spec) =>
      spec
        .split("/")
        .slice(0, spec.startsWith("@") ? 2 : 1)
        .join("/"),
    )
}

describe("published packages declare what their shipped source imports", () => {
  it("reads imports, not comments", () => {
    const source = [
      '// import { x } from "commented-out"',
      "/* a block naming",
      ' from "also-commented" */',
      'import type { A } from "@scope/types/sub"',
      "import {",
      "  b,",
      '} from "multi-line"',
      'export { c } from "re-exported"',
      'import "side-effect/style.css"',
      'const lazy = () => import("lazy-loaded")',
      'import { d } from "./local.js"',
      'import fs from "node:fs"',
      'import path from "path"',
    ].join("\n")
    expect(importedPackages(source).sort()).toEqual(
      ["@scope/types", "lazy-loaded", "multi-line", "re-exported", "side-effect"].sort(),
    )
  })

  it.each(publishedPackages().map(({ dir, manifest }) => ({ name: manifest.name, dir, manifest })))(
    "$name",
    ({ dir, manifest }) => {
      const declared = new Set([
        manifest.name,
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ])
      const src = path.join(dir, "src")
      const undeclared = fs
        .readdirSync(src, { recursive: true, encoding: "utf8" })
        .filter(isShipped)
        .flatMap((rel) =>
          importedPackages(fs.readFileSync(path.join(src, rel), "utf8"))
            .filter((name) => !declared.has(name))
            .map((name) => `${rel}: ${name}`),
        )
      expect([...new Set(undeclared)]).toEqual([])
    },
  )
})
