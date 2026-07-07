import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { METRIC_NAMES } from "./metric-names.js"

/**
 * TS side of the Kotlin↔TS metric contract (`metrics-contract.json`):
 * - `METRIC_NAMES` mirrors the contract's `promName`s exactly
 * - every `camunda_*` series used by the alert rules and Grafana dashboards
 *   exists in the contract
 * - query sources use `METRIC_NAMES` only — no raw `camunda_*` literals
 * - label values consumers hardcode (e.g. `state="COMPLETED"`) are declared
 *   as `knownValues` in the contract
 *
 * Paths are resolved relative to this file (`import.meta.url`), so the test
 * works no matter which directory vitest is started from.
 */

interface ContractMetric {
  otelName: string
  promName: string
  type: "counter" | "histogram" | "gauge"
  unit: string
  labels: string[]
  knownValues?: Record<string, string[]>
}

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const repoRoot = here("../../..")

const contract = JSON.parse(readFileSync(here("../metrics-contract.json"), "utf8")) as {
  metrics: ContractMetric[]
}

/** All Prometheus series names the contract covers (histograms expand to _sum/_count/_bucket). */
const coveredSeries = new Set(
  contract.metrics.flatMap((m) =>
    m.type === "histogram"
      ? [m.promName, `${m.promName}_sum`, `${m.promName}_count`, `${m.promName}_bucket`]
      : [m.promName],
  ),
)

const extractSeries = (text: string) => [...new Set(text.match(/camunda_[a-zA-Z0-9_]+/g) ?? [])]

/** Strip block and line comments — doc comments may legitimately mention series names. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")

describe("metrics contract", () => {
  it("declares well-formed metrics", () => {
    expect(contract.metrics.length).toBeGreaterThan(0)
    for (const m of contract.metrics) {
      expect(m.otelName, m.promName).toMatch(/^camunda\.[a-z._]+$/)
      expect(["counter", "histogram", "gauge"]).toContain(m.type)
      expect(m.labels.length, `${m.promName} must carry engine_id`).toBeGreaterThan(0)
      expect(m.labels).toContain("engine_id")
      for (const label of Object.keys(m.knownValues ?? {})) {
        expect(m.labels, `knownValues key ${label} of ${m.promName}`).toContain(label)
      }
    }
  })

  it("METRIC_NAMES mirrors the contract exactly", () => {
    const contractNames = contract.metrics.map((m) => m.promName).sort()
    const constNames = Object.values<string>(METRIC_NAMES).sort()
    expect(constNames).toEqual(contractNames)
  })

  it("covers every camunda_* metric used in the Prometheus alert rules", () => {
    const alerts = readFileSync(join(repoRoot, "playground/docker/prometheus/alerts.yml"), "utf8")
    const used = extractSeries(alerts)
    expect(used.length).toBeGreaterThan(0)
    for (const series of used) {
      expect(coveredSeries.has(series), `${series} (alerts.yml) missing from contract`).toBe(true)
    }
  })

  it("covers every camunda_* metric used in the Grafana dashboards", () => {
    const dashboardsDir = join(repoRoot, "playground/docker/grafana/dashboards")
    const dashboards = readdirSync(dashboardsDir).filter((f) => f.endsWith(".json"))
    expect(dashboards.length).toBeGreaterThan(0)
    for (const file of dashboards) {
      const used = extractSeries(readFileSync(join(dashboardsDir, file), "utf8"))
      expect(used.length, `${file} should reference camunda_* metrics`).toBeGreaterThan(0)
      for (const series of used) {
        expect(coveredSeries.has(series), `${series} (${file}) missing from contract`).toBe(true)
      }
    }
  })

  it("query sources contain no raw camunda_* literals (METRIC_NAMES only)", () => {
    const queriesDir = here("./queries")
    const sources = readdirSync(queriesDir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    )
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      const code = stripComments(readFileSync(join(queriesDir, file), "utf8"))
      const literals = extractSeries(code)
      expect(literals, `queries/${file} must use METRIC_NAMES`).toEqual([])
    }
  })

  it("hardcoded label values in queries and alert rules are declared knownValues", () => {
    const queriesDir = here("./queries")
    const texts = readdirSync(queriesDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => stripComments(readFileSync(join(queriesDir, f), "utf8")))
    texts.push(readFileSync(join(repoRoot, "playground/docker/prometheus/alerts.yml"), "utf8"))

    const knownValues = new Map<string, Set<string>>()
    for (const m of contract.metrics) {
      for (const [label, values] of Object.entries(m.knownValues ?? {})) {
        const set = knownValues.get(label) ?? new Set<string>()
        values.forEach((v) => set.add(v))
        knownValues.set(label, set)
      }
    }
    expect(knownValues.size).toBeGreaterThan(0)

    let checked = 0
    for (const [label, values] of knownValues) {
      // Exact-match selectors only (`label="literal"`); the lookbehind keeps
      // e.g. `alertstate="firing"` from matching the `state` label.
      const usage = new RegExp(`(?<![A-Za-z_])${label}="([A-Za-z_][A-Za-z0-9_]*)"`, "g")
      for (const text of texts) {
        for (const match of text.matchAll(usage)) {
          checked++
          expect(values.has(match[1]), `${label}="${match[1]}" not in knownValues`).toBe(true)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
