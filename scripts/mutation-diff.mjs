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
 * A package with more than FILE_CAP in-scope changed files FAILS the gate
 * (it used to be skipped with exit 0 — a large refactor then got no mutation
 * check at all). Split the change, or opt out explicitly and reviewably with
 * a commit trailer in the branch range:
 *
 *   Mutation-Cap-Exception: <reason, e.g. the full local run's score>
 *
 * Usage: node scripts/mutation-diff.mjs [baseRef]   (default origin/main)
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import picomatch from "picomatch"

/** Gitignored, per-package, wiped before every gate run — see below. */
const GATE_INCREMENTAL_FILE = ".stryker-tmp/diff-gate-incremental.json"

/** Guard against unbounded runtime on huge diffs — loudly, never silently. */
export const FILE_CAP = 25

export const CAP_EXCEPTION_TRAILER = /^Mutation-Cap-Exception: .+/m

/**
 * Mirror Stryker's own `mutate` semantics. picomatch instead of a hand-rolled
 * glob→RegExp: a home-grown converter silently under-scoped `**` to a single
 * path segment, which quietly dropped nested files (e.g. widget-shell's
 * src/ui/bpmn-heatmap/) out of the gate. Positives and negatives are matched
 * separately on purpose — picomatch ORs an array, so passing `mutate` verbatim
 * would make a single `!…` entry match everything else.
 */
export function inMutateScope(relFile, mutatePatterns) {
  const positives = mutatePatterns.filter((p) => !p.startsWith("!"))
  const negatives = mutatePatterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1))
  return picomatch.isMatch(relFile, positives) && !picomatch.isMatch(relFile, negatives)
}

/**
 * Which packages run and which hit the cap (pure; unit-tested). Over the cap
 * a package FAILS the gate unless `exceptionReason` (the trailer line) is set
 * — then it is skipped with a loud warning instead.
 */
export function planMutationRuns(byPackage, { cap = FILE_CAP, exceptionReason } = {}) {
  const runs = []
  const capped = []
  for (const [pkg, files] of byPackage) {
    if (files.length > cap) capped.push({ pkg, count: files.length })
    else runs.push({ pkg, files })
  }
  return { runs, capped, failed: capped.length > 0 && !exceptionReason }
}

function main() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" })
  const base = process.argv[2] ?? "origin/main"
  const mergeBase = git("merge-base", base, "HEAD").trim()
  const changed = git("diff", "--name-only", mergeBase, "HEAD").split("\n").filter(Boolean)

  const byPackage = new Map()
  for (const file of changed) {
    // Package roots: packages/core/<pkg> and packages/connectors/<family>/<pkg>.
    const match = /^(packages\/(?:core\/[^/]+|connectors\/[^/]+\/[^/]+))\/(.+)$/.exec(file)
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

  const exceptionReason = CAP_EXCEPTION_TRAILER.exec(
    git("log", `${mergeBase}..HEAD`, "--format=%B"),
  )?.[0]
  const plan = planMutationRuns(byPackage, { exceptionReason })
  for (const { pkg, count } of plan.capped) {
    const local = `pnpm --filter ./${pkg} run test:mutation`
    if (exceptionReason) {
      console.log(
        `::warning::mutation-diff: ${pkg} changed ${count} in-scope files (cap ${FILE_CAP}) — ` +
          `NOT mutation-tested, waved through by "${exceptionReason}". Reviewers: check that ` +
          `the reason names a full local run (${local}).`,
      )
    } else {
      console.error(
        `::error::mutation-diff: ${pkg} changed ${count} in-scope files (cap ${FILE_CAP}) — the ` +
          `diff gate cannot cover it. Split the change, or run \`${local}\` locally and add a ` +
          `commit trailer "Mutation-Cap-Exception: <reason + score>" (reviewed like any commit).`,
      )
    }
  }

  let failed = plan.failed
  for (const { pkg, files } of plan.runs) {
    console.log(`mutation-diff: ${pkg} → ${files.length} file(s)\n  ${files.join("\n  ")}`)
    // Off the package's incremental cache, on a throwaway file wiped every run:
    // that cache would fold the OTHER files' cached results back into the score
    // and the gate would pass locally on a file that fails on CI's fresh
    // checkout. Also keeps reports/mutation-report.json scoped to the diff.
    rmSync(`${pkg}/${GATE_INCREMENTAL_FILE}`, { force: true })
    const result = spawnSync(
      "pnpm",
      [
        "--filter",
        `./${pkg}`,
        "run",
        "test:mutation",
        "--mutate",
        files.join(","),
        "--incrementalFile",
        GATE_INCREMENTAL_FILE,
      ],
      { stdio: "inherit" },
    )
    if (result.status !== 0) failed = true
  }
  process.exit(failed ? 1 : 0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) main()
