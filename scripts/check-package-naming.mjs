#!/usr/bin/env node
/**
 * Naming-convention gate: the dependency-cruiser rules key on layout + naming
 * (`packages/connectors/<family>/<name>-connector|-client`, npm
 * `@miragon-ai/<basename>`; foundation packages under `packages/core/`), so a
 * package at the right depth with the WRONG suffix would silently fall out of
 * the peer-isolation/client rules while still being built and published. This
 * check closes that fail-open: every directory the workspace globs pick up
 * must follow the convention the rules assume.
 *
 * Runs as `pnpm lint:naming` (chained into the root `pnpm lint`).
 */
import { readdirSync, readFileSync } from "node:fs"
import { basename } from "node:path"

const errors = []

/** Mirror of a `<root>/*` workspace glob: the direct child directories. */
const childDirs = (root) =>
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${root}/${entry.name}`)
    .sort()

const packageName = (dir) => {
  try {
    return JSON.parse(readFileSync(`${dir}/package.json`, "utf8")).name
  } catch {
    errors.push(`${dir}: missing or unreadable package.json`)
    return undefined
  }
}

// Connector-family packages: role carried in the directory + npm name.
for (const dir of childDirs("packages/connectors").flatMap(childDirs)) {
  const base = basename(dir)
  if (!base.endsWith("-connector") && !base.endsWith("-client")) {
    errors.push(
      `${dir}: connector-family packages must end in -connector or -client ` +
        `(the dependency-cruiser rules key on that suffix — this name falls out of them)`,
    )
  }
  const name = packageName(dir)
  if (name !== undefined && name !== `@miragon-ai/${base}`) {
    errors.push(
      `${dir}: npm name "${name}" must be @miragon-ai/${base} ` +
        `(directory and npm name carry the same convention the rules match on)`,
    )
  }
}

// Foundation packages: no role suffix, but npm name still mirrors the dir.
for (const dir of childDirs("packages/core")) {
  const base = basename(dir)
  const name = packageName(dir)
  if (name !== undefined && name !== `@miragon-ai/${base}`) {
    errors.push(`${dir}: npm name "${name}" must be @miragon-ai/${base}`)
  }
}

if (errors.length > 0) {
  console.error("Package naming convention violations:\n")
  for (const error of errors) console.error(`  - ${error}`)
  console.error(
    "\nLayout + naming are load-bearing (CLAUDE.md invariant 8): rename the package " +
      "to the convention instead of adjusting this check.",
  )
  process.exit(1)
}

console.log("Package naming: all workspace packages follow the core/connector conventions.")
