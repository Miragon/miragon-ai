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
 * - label values consumers hardcode (`state="COMPLETED"`, `status=~"total|…"`)
 *   in queries, alert rules and dashboards are declared as `knownValues`
 * - PromQL grouping labels (`sum by (…)`) are declared on the metric they
 *   group, not merely somewhere in the contract's label union
 * - every contract metric has at least one consumer (dead-entry guard)
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

/**
 * Replace `${M.foo}` / `${METRIC_NAMES.foo}` interpolations with the real
 * series name, so the queries' PromQL can be scanned by the same plain-text
 * parsers as the alert rules and dashboards.
 */
const resolveMetricInterpolations = (code: string) =>
  code.replace(/\$\{(?:M|METRIC_NAMES)\.([A-Za-z0-9_]+)\}/g, (_, key: string) => {
    const name = (METRIC_NAMES as Record<string, string>)[key]
    if (name === undefined) throw new Error(`unknown METRIC_NAMES key "${key}"`)
    return name
  })

/**
 * Every string value in a JSON document — Grafana dashboards keep their PromQL
 * in string fields (`expr`, templating `query`, …); collecting all string
 * values also undoes the JSON escaping (`\"` → `"`) that would defeat the
 * label-matcher regexes.
 */
const jsonStringValues = (node: unknown): string[] => {
  if (typeof node === "string") return [node]
  if (Array.isArray(node)) return node.flatMap(jsonStringValues)
  if (node !== null && typeof node === "object")
    return Object.values(node as Record<string, unknown>).flatMap(jsonStringValues)
  return []
}

interface ConsumerSource {
  name: string
  text: string
}

const queriesDir = here("./queries")
const dashboardsDir = join(repoRoot, "playground/docker/grafana/dashboards")
const alertsFile = join(repoRoot, "playground/docker/prometheus/alerts.yml")

/** Query sources, comment-stripped, with `METRIC_NAMES` interpolations resolved. */
const querySources = (): ConsumerSource[] =>
  readdirSync(queriesDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({
      name: `queries/${f}`,
      text: resolveMetricInterpolations(stripComments(readFileSync(join(queriesDir, f), "utf8"))),
    }))

const alertsSource = (): ConsumerSource => ({
  name: "alerts.yml",
  text: readFileSync(alertsFile, "utf8"),
})

const dashboardSources = (): ConsumerSource[] =>
  readdirSync(dashboardsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: `dashboards/${f}`,
      text: jsonStringValues(
        JSON.parse(readFileSync(join(dashboardsDir, f), "utf8")) as unknown,
      ).join("\n"),
    }))

/** Every place that consumes the metrics: TS queries, alert rules, dashboards. */
const allConsumerSources = (): ConsumerSource[] => [
  ...querySources(),
  alertsSource(),
  ...dashboardSources(),
]

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
    const alerts = readFileSync(alertsFile, "utf8")
    const used = extractSeries(alerts)
    expect(used.length).toBeGreaterThan(0)
    for (const series of used) {
      expect(coveredSeries.has(series), `${series} (alerts.yml) missing from contract`).toBe(true)
    }
  })

  it("covers every camunda_* metric used in the Grafana dashboards", () => {
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

  it("hardcoded label values in queries, alert rules and dashboards are declared knownValues", () => {
    const sources = allConsumerSources()

    const knownValues = new Map<string, Set<string>>()
    for (const m of contract.metrics) {
      for (const [label, values] of Object.entries(m.knownValues ?? {})) {
        const set = knownValues.get(label) ?? new Set<string>()
        values.forEach((v) => set.add(v))
        knownValues.set(label, set)
      }
    }
    expect(knownValues.size).toBeGreaterThan(0)

    /** Regex-matcher alternatives that are regex syntax or Grafana variables, not values. */
    const isWildcard = (alt: string) => alt === ".*" || alt === ".+" || alt.startsWith("$")

    let exactChecked = 0
    let regexChecked = 0
    for (const [label, values] of knownValues) {
      // Exact-match selectors (`label="literal"`); the lookbehind keeps
      // e.g. `alertstate="firing"` from matching the `state` label.
      const exact = new RegExp(`(?<![A-Za-z_])${label}="([A-Za-z_][A-Za-z0-9_]*)"`, "g")
      // Regex selectors (`label=~"total|unassigned"`): every alternative must
      // be a knownValue, except wildcards (`.*`/`.+`) and Grafana variables.
      const regexSel = new RegExp(`(?<![A-Za-z_])${label}=~"([^"]*)"`, "g")
      for (const { name, text } of sources) {
        for (const match of text.matchAll(exact)) {
          exactChecked++
          expect(values.has(match[1]), `${label}="${match[1]}" (${name}) not in knownValues`).toBe(
            true,
          )
        }
        for (const match of text.matchAll(regexSel)) {
          for (const alt of match[1].split("|")) {
            if (isWildcard(alt)) continue
            regexChecked++
            expect(
              /^[A-Za-z_][A-Za-z0-9_]*$/.test(alt),
              `${label}=~"${match[1]}" (${name}): alternative "${alt}" is neither a plain value nor a recognised wildcard — extend the parser if the pattern is legitimate`,
            ).toBe(true)
            expect(
              values.has(alt),
              `${label}=~"${match[1]}" (${name}): "${alt}" not in knownValues`,
            ).toBe(true)
          }
        }
      }
    }
    expect(exactChecked).toBeGreaterThan(0)
    // The Grafana dashboard pins `status=~"total|unassigned"` — if this reads
    // 0 the regex-matcher scan silently broke, not the dashboard.
    expect(regexChecked).toBeGreaterThan(0)
  })

  it("PromQL grouping labels are declared on the metric they group", () => {
    const seriesToMetric = new Map<string, ContractMetric>()
    for (const m of contract.metrics) {
      seriesToMetric.set(m.promName, m)
      if (m.type === "histogram") {
        for (const suffix of ["_sum", "_count", "_bucket"]) {
          seriesToMetric.set(`${m.promName}${suffix}`, m)
        }
      }
    }

    // `sum by (a, b)(increase(camunda_x{…}[7d]))` — a by-clause plus the first
    // camunda_* series of the aggregated expression (possibly behind nested
    // calls such as rate()/increase()).
    const grouped =
      /\bby\s*\(([^)]*)\)\s*\(\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*\(\s*)*(camunda_[A-Za-z0-9_]+)/g

    let checked = 0
    for (const { name, text } of allConsumerSources()) {
      const byClauses = text.match(/\bby\s*\(/g) ?? []
      const matches = [...text.matchAll(grouped)]
      // Every by-clause must be attributable to a camunda_* series; if a new
      // query shape defeats the regex, extend it rather than losing coverage.
      expect(matches.length, `unattributable "by (…)" clause in ${name}`).toBe(byClauses.length)
      for (const [, labelList, series] of matches) {
        const metric = seriesToMetric.get(series)
        expect(metric, `${series} (${name}) missing from contract`).toBeDefined()
        if (!metric) continue
        const labels = labelList
          .split(",")
          .map((l) => l.trim())
          .filter((l) => l !== "" && l !== "le") // `le` is the histogram bucket label
        for (const label of labels) {
          checked++
          expect(
            metric.labels.includes(label),
            `${name} groups ${series} by "${label}" — not a declared label of ${metric.promName}`,
          ).toBe(true)
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it("every contract metric has at least one consumer (queries, alerts or dashboards)", () => {
    // Emitted by the engine plugin for future dashboards but consumed nowhere
    // yet. Remove an entry from this allowlist the moment a consumer appears —
    // the stale-entry check below fails to remind you. Do NOT add new entries
    // without the same "deliberately emitted ahead of consumption" rationale.
    const KNOWN_UNCONSUMED = new Set([
      "camunda_usertask_created_total",
      "camunda_usertask_completed_total",
    ])

    const used = new Set(allConsumerSources().flatMap(({ text }) => extractSeries(text)))

    for (const m of contract.metrics) {
      const series =
        m.type === "histogram"
          ? [m.promName, `${m.promName}_sum`, `${m.promName}_count`, `${m.promName}_bucket`]
          : [m.promName]
      const consumed = series.some((s) => used.has(s))
      if (KNOWN_UNCONSUMED.has(m.promName)) {
        expect(consumed, `${m.promName} is consumed now — remove it from KNOWN_UNCONSUMED`).toBe(
          false,
        )
      } else {
        expect(
          consumed,
          `${m.promName} has no consumer (TS queries, alerts.yml, Grafana dashboards) — dead contract entry?`,
        ).toBe(true)
      }
    }
  })
})
