import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { PrometheusClient, PromSample } from "./prometheus.js"
import * as queries from "./queries/index.js"
import {
  checkQueryLabels,
  contractCatalog,
  type ContractMetricLike,
  type SeriesCatalog,
} from "./promql-labels.test-support.js"
import { alertExpressions, dashboardQueries } from "./promql-sources.test-support.js"

/**
 * Behavioural half of the metrics contract: instead of scanning source text,
 * run every exported query function against a recording Prometheus client and
 * check each PromQL it actually sends — every matcher label, every
 * `by`/`without` grouping label, every `on`/`ignoring`/`group_*` label — against
 * the labels `metrics-contract.json` declares for that series. The alert rules
 * and Grafana dashboards go through the same checker.
 *
 * A text scan cannot see a label that only exists in a composed selector; this
 * one caught `analytics_version_compare` filtering the incident counter on
 * `process_definition_version`, a label that series never carries (#327).
 */

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
// src/ → analytics-client → analytics → connectors → packages → repo root
const repoRoot = here("../../../../..")

const contract = JSON.parse(readFileSync(here("../metrics-contract.json"), "utf8")) as {
  metrics: ContractMetricLike[]
}

const alertsFile = join(repoRoot, "playground/docker/prometheus/alerts.yml")
const dashboardsDir = join(repoRoot, "playground/docker/grafana/dashboards")

/**
 * Non-contract series Prometheus synthesises itself. `up` carries the scrape
 * target labels (no target relabelling in prometheus.yml). `ALERTS` carries
 * `alertname`/`alertstate`, each rule's static `severity` and the labels its
 * expression yields — derived from alerts.yml below, never hand-listed, so a
 * rule that stops aggregating by a label also drops it here.
 */
const UP_LABELS = ["job", "instance"]
const ALERTS_BASE_LABELS = ["alertname", "alertstate", "severity"]

const ruleCatalog = contractCatalog(contract.metrics, { up: { labels: UP_LABELS } })
const alertsYaml = readFileSync(alertsFile, "utf8")
const alertRules = alertExpressions(alertsYaml)
const alertLabels = new Set([
  ...ALERTS_BASE_LABELS,
  ...alertRules.flatMap((expr) => checkQueryLabels(expr, ruleCatalog).resultLabels ?? []),
])

const catalog: SeriesCatalog = contractCatalog(contract.metrics, {
  up: { labels: UP_LABELS },
  ALERTS: { labels: [...alertLabels] },
})

/**
 * PrometheusClient that records every instant PromQL string. It answers each
 * one with a single representative sample, so the result mapping runs too — a
 * function that only queries further after non-empty data still gets there.
 */
function recordingClient(): { ch: PrometheusClient; sent: string[] } {
  const sent: string[] = []
  const sample: PromSample = {
    metric: {
      engine_id: "prod-a",
      process_definition_key: "invoice",
      activity_id: "Task_check",
      activity_type: "serviceTask",
      incident_type: "failedJob",
      alertname: "CibSevenDeadJobs",
      severity: "warning",
    },
    value: 1,
  }
  return {
    ch: {
      instant: (query: string) => {
        sent.push(query)
        return Promise.resolve([sample])
      },
    },
    sent,
  }
}

type Scenario = (ch: PrometheusClient) => Promise<unknown>

/**
 * Representative argument sets for EVERY exported query function — typed as a
 * total map over the `queries` namespace, so a new export without a scenario
 * fails `pnpm typecheck` (and the runtime check below). Between them the sets
 * switch on every optional matcher: engine filter (single and multi), element
 * scope, incident type, process scope present and absent, the breakdowns.
 */
const SCENARIOS: { [K in keyof typeof queries]: Scenario[] } = {
  analyzePerformance: [
    (ch) =>
      queries.analyzePerformance(ch, {
        processDefinitionKey: "invoice",
        period: "7d",
        includeActivityBreakdown: true,
        engine: "prod-a",
      }),
  ],
  comparePeriods: [
    (ch) =>
      queries.comparePeriods(ch, {
        processDefinitionKey: "invoice",
        periodAFrom: "2026-09-01T00:00:00Z",
        periodATo: "2026-09-08T00:00:00Z",
        periodBFrom: "2026-09-08T00:00:00Z",
        periodBTo: "2026-09-15T00:00:00Z",
        includeActivityBreakdown: true,
        engine: ["prod-a", "prod-b"],
      }),
  ],
  findFailedInstances: [
    (ch) =>
      queries.findFailedInstances(ch, {
        processDefinitionKey: "invoice",
        incidentType: "failedJob",
        limit: 10,
        engine: "prod-a",
      }),
    (ch) => queries.findFailedInstances(ch, { limit: 10 }),
  ],
  elementBottleneck: [
    (ch) =>
      queries.elementBottleneck(ch, {
        processDefinitionKey: "invoice",
        period: "7d",
        minBucketSize: 1,
        limit: 10,
        engine: "prod-a",
      }),
  ],
  elementHeat: [
    (ch) => queries.elementHeat(ch, { processDefinitionKey: "invoice", period: "7d", engine: "a" }),
  ],
  clusterCompare: [
    (ch) =>
      queries.clusterCompare(ch, {
        processDefinitionKey: "invoice",
        elementId: "Task_check",
        deploymentTimestamp: "2026-09-08T00:00:00Z",
        windowBeforeDays: 7,
        windowAfterDays: 7,
        minBucketSize: 1,
        engine: "prod-a",
      }),
    (ch) =>
      queries.clusterCompare(ch, {
        deploymentTimestamp: "2026-09-08T00:00:00Z",
        windowBeforeDays: 7,
        windowAfterDays: 7,
        minBucketSize: 1,
      }),
  ],
  versionCompare: [
    (ch) =>
      queries.versionCompare(ch, {
        processDefinitionKey: "invoice",
        versionA: 1,
        versionB: 2,
        windowDays: 14,
        elementId: "Task_check",
        minBucketSize: 1,
        engine: ["prod-a", "prod-b"],
      }),
  ],
  engineCompare: [
    (ch) =>
      queries.engineCompare(ch, {
        processDefinitionKey: "invoice",
        engineA: "prod-a",
        engineB: "prod-b",
        windowDays: 14,
        elementId: "Task_check",
        minBucketSize: 1,
      }),
  ],
  engineLandscape: [
    (ch) => queries.engineLandscape(ch),
    (ch) => queries.engineLandscape(ch, { engine: ["prod-a", "prod-b"] }),
  ],
  dashboardData: [
    (ch) => queries.dashboardData(ch, { processDefinitionKey: "invoice", period: "7d" }),
    (ch) => queries.dashboardData(ch, { period: "1d", engine: "prod-a" }),
  ],
  failureDashboardData: [(ch) => queries.failureDashboardData(ch, { engine: "prod-a" })],
  engineHealth: [
    (ch) => queries.engineHealth(ch, {}),
    (ch) => queries.engineHealth(ch, { engine: "prod-a" }),
  ],
}

/** Violations of one PromQL source, each prefixed with where it came from. */
function violationsOf(origin: string, promql: string): string[] {
  return checkQueryLabels(promql, catalog).violations.map((v) => `${origin}: ${v}\n    ${promql}`)
}

describe("metrics contract — labels each query actually sends", () => {
  it("has a scenario for every exported query function", () => {
    const exported = Object.keys(queries).filter(
      (k) => typeof (queries as Record<string, unknown>)[k] === "function",
    )
    expect(Object.keys(SCENARIOS).sort()).toEqual(exported.sort())
  })

  it.each(Object.entries(SCENARIOS))(
    "%s names only labels its series declare",
    async (name, scenarios) => {
      const violations: string[] = []
      let checked = 0
      for (const run of scenarios) {
        const { ch, sent } = recordingClient()
        await run(ch)
        expect(sent.length, `${name} sent no PromQL`).toBeGreaterThan(0)
        for (const promql of sent) {
          violations.push(...violationsOf(name, promql))
          checked += checkQueryLabels(promql, catalog).checkedLabels
        }
      }
      expect(violations).toEqual([])
      // Every query scopes by at least one label (engine, process, …) — 0
      // here means the scenario args or the checker went blind.
      expect(checked, `${name}: no label reference was checked`).toBeGreaterThan(0)
    },
  )
})

describe("metrics contract — labels in alert rules and dashboards", () => {
  it("alert rule expressions name only declared labels", () => {
    expect(alertRules.length).toBeGreaterThan(0)
    // Every `expr:` in the file was extracted — none hides in a YAML shape
    // (flow mapping, …) the extractor does not read.
    expect(alertRules).toHaveLength(alertsYaml.match(/\bexpr:/g)?.length ?? 0)
    expect(alertRules.flatMap((expr) => violationsOf("alerts.yml", expr))).toEqual([])
    for (const expr of alertRules) {
      // A rule that selects no series or yields no vector was not checked —
      // e.g. an expression that parsed as one PromQL string literal.
      const { series, resultLabels } = checkQueryLabels(expr, catalog)
      expect(series, `alerts.yml selects no series: ${expr}`).not.toEqual([])
      expect(resultLabels, `alerts.yml yields no vector: ${expr}`).toBeDefined()
    }
    // The rules aggregate by engine_id — `engineHealth` filters ALERTS on it.
    expect(alertLabels.has("engine_id")).toBe(true)
  })

  it("Grafana dashboard queries name only declared labels", () => {
    const files = readdirSync(dashboardsDir).filter((f) => f.endsWith(".json"))
    expect(files.length).toBeGreaterThan(0)
    let expressions = 0
    const violations: string[] = []
    for (const file of files) {
      const dashboard = JSON.parse(readFileSync(join(dashboardsDir, file), "utf8")) as unknown
      for (const promql of dashboardQueries(dashboard)) {
        expressions++
        violations.push(...violationsOf(`dashboards/${file}`, promql))
        const { series } = checkQueryLabels(promql, catalog)
        expect(series, `dashboards/${file} selects no series: ${promql}`).not.toEqual([])
      }
    }
    expect(expressions).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })
})
