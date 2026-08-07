#!/usr/bin/env node
/**
 * `pnpm fitness` — the repo's fitness-function dashboard. Aggregates what the
 * gates already measure into one report: architecture graph (dependency-
 * cruiser), ratchet debt (eslint.config.mjs), per-package coverage (from the
 * last `pnpm test` run's coverage-summary.json) and mutation scores (from
 * reports/mutation-report.json where a mutation run has happened).
 *
 * Read-only over existing artifacts except the architecture check, which is
 * fast enough to run inline. Appends the report to $GITHUB_STEP_SUMMARY in CI.
 */
import { execSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs"
import { complexityRatchet, maxLinesRatchet } from "../eslint.config.mjs"

const lines = []
const put = (s = "") => lines.push(s)

// ── Architecture gate ───────────────────────────────────────────────────────
let archLine = "failed to run"
try {
  const out = execSync(
    "pnpm exec depcruise apps/*/src packages/*/src --config .dependency-cruiser.cjs",
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  archLine = /no dependency violations found \((.+)\)/.exec(out)?.[1] ?? out.trim()
  archLine = `0 violations (${archLine})`
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`
  const summary = /(\d+) dependency violations/.exec(out)?.[0] ?? "violations present"
  archLine = `❌ ${summary}`
}

// ── Ratchet debt ────────────────────────────────────────────────────────────
const complexityDebt = Object.keys(complexityRatchet).length
const lengthDebt = Object.keys(maxLinesRatchet).length

put("## Fitness report")
put()
put(`- Architecture (dependency-cruiser): ${archLine}`)
put(`- Ratchet debt: ${complexityDebt} complexity, ${lengthDebt} max-lines entries (shrink-only)`)
put()

// ── Per-package coverage + mutation ─────────────────────────────────────────
const pkgDirs = ["packages", "apps"].flatMap((root) =>
  readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `${root}/${d.name}`),
)

const pct = (n) => (typeof n === "number" ? `${n.toFixed(1)}%` : "—")

function mutationScore(reportPath) {
  if (!existsSync(reportPath)) return null
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  let detected = 0
  let undetected = 0
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      if (mutant.status === "Killed" || mutant.status === "Timeout") detected += 1
      else if (mutant.status === "Survived" || mutant.status === "NoCoverage") undetected += 1
    }
  }
  const valid = detected + undetected
  return valid === 0 ? null : (detected / valid) * 100
}

put("| Package | Lines | Branches | Functions | Mutation score |")
put("| --- | --- | --- | --- | --- |")
for (const dir of pkgDirs) {
  const covPath = `${dir}/coverage/coverage-summary.json`
  const mutPath = `${dir}/reports/mutation-report.json`
  if (!existsSync(covPath) && !existsSync(mutPath)) continue
  const name = JSON.parse(readFileSync(`${dir}/package.json`, "utf8")).name
  const cov = existsSync(covPath) ? JSON.parse(readFileSync(covPath, "utf8")).total : null
  const score = mutationScore(mutPath)
  put(
    `| ${name} | ${pct(cov?.lines?.pct)} | ${pct(cov?.branches?.pct)} | ${pct(cov?.functions?.pct)} | ${
      score === null ? "— (no run)" : pct(score)
    } |`,
  )
}
put()
put(
  "_Coverage from the last `pnpm test`; mutation scores from the last Stryker run per package (`pnpm --filter <pkg> run test:mutation`). Missing rows: no artifacts yet._",
)

const report = lines.join("\n")
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n")
