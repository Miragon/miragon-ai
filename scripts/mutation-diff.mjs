#!/usr/bin/env node
/**
 * PR-diff mutation gate: runs Stryker only over source files the branch
 * actually changed, per package. Full-repo mutation is too slow for a PR
 * check; the diff scope keeps the loop honest — changed logic must kill its
 * mutants (enforced by each package's `thresholds.break` in
 * stryker.config.json).
 *
 * A package participates by having a stryker.config.json; only changed files
 * inside that config's `mutate` allowlist count (widgets are deliberately
 * outside it — they have no render tests, so mutating them would only produce
 * no-coverage noise).
 *
 * Usage: node scripts/mutation-diff.mjs [baseRef]   (default origin/main)
 */
import { execSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const base = process.argv[2] ?? "origin/main"
const mergeBase = execSync(`git merge-base ${base} HEAD`, { encoding: "utf8" }).trim()
const changed = execSync(`git diff --name-only ${mergeBase} HEAD`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)

/** Convert the simple globs used in stryker.config.json to a RegExp. */
function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
  return new RegExp(`^${escaped}$`)
}

function inMutateScope(relFile, mutatePatterns) {
  const positives = mutatePatterns.filter((p) => !p.startsWith("!"))
  const negatives = mutatePatterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1))
  return (
    positives.some((p) => globToRegExp(p).test(relFile)) &&
    !negatives.some((p) => globToRegExp(p).test(relFile))
  )
}

const byPackage = new Map()
for (const file of changed) {
  const match = /^(packages\/[^/]+)\/(.+)$/.exec(file)
  if (!match || !existsSync(file)) continue
  const [, pkg, rel] = match
  const configPath = `${pkg}/stryker.config.json`
  if (!existsSync(configPath)) continue
  const { mutate } = JSON.parse(readFileSync(configPath, "utf8"))
  if (!inMutateScope(rel, mutate)) continue
  if (!byPackage.has(pkg)) byPackage.set(pkg, [])
  byPackage.get(pkg).push(rel)
}

if (byPackage.size === 0) {
  console.log(`mutation-diff: no changed files inside any mutation scope vs ${base} — skipping.`)
  process.exit(0)
}

// Guard against unbounded runtime on huge diffs — loudly, never silently.
const FILE_CAP = 25
let failed = false
for (const [pkg, files] of byPackage) {
  if (files.length > FILE_CAP) {
    console.log(
      `mutation-diff: ${pkg} changed ${files.length} in-scope files (cap ${FILE_CAP}) — ` +
        `SKIPPING the diff gate here. Run \`pnpm --filter ./${pkg} run test:mutation\` ` +
        `locally for the full picture.`,
    )
    continue
  }
  console.log(`mutation-diff: ${pkg} → ${files.length} file(s)\n  ${files.join("\n  ")}`)
  const result = spawnSync(
    "pnpm",
    ["--filter", `./${pkg}`, "run", "test:mutation", "--mutate", files.join(",")],
    { stdio: "inherit" },
  )
  if (result.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
