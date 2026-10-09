import fs from "node:fs"
import path from "node:path"

/**
 * The non-test sources of every app and package — what the cross-module
 * source guards (tool-name refs, hand-off refs) read. Only the app sees every
 * module at once, so these guards live here.
 */

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..")

/**
 * Source roots: apps/<app>/src, packages/core/<pkg>/src,
 * packages/connectors/<family>/<pkg>/src.
 */
function sourceRoots(): string[] {
  const dirs = (root: string) =>
    fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name))
  const packages = path.join(REPO_ROOT, "packages")
  return [
    ...dirs(path.join(REPO_ROOT, "apps")),
    ...dirs(path.join(packages, "core")),
    ...dirs(path.join(packages, "connectors")).flatMap(dirs),
  ]
    .map((pkg) => path.join(pkg, "src"))
    .filter((src) => fs.existsSync(src))
}

const isScannedSource = (file: string) =>
  /\.tsx?$/.test(file) &&
  !/\.test\.tsx?$/.test(file) &&
  !/\.test-support\.ts$/.test(file) &&
  !file.split(path.sep).includes("generated")

/** Runs `scan` over every scanned source file (repo-relative path, text). */
export function scanSources<T>(scan: (file: string, text: string) => T[]): T[] {
  return sourceRoots().flatMap((src) =>
    fs
      .readdirSync(src, { recursive: true, encoding: "utf8" })
      .map((rel) => path.join(src, rel))
      .filter(isScannedSource)
      .flatMap((file) => scan(path.relative(REPO_ROOT, file), fs.readFileSync(file, "utf8"))),
  )
}
