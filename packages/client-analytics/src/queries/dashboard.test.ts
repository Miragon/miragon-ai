import { describe, expect, it, vi } from "vitest"
import { dashboardData, failureDashboardData } from "./dashboard.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })
const def = (key: string, value: number): PromSample => ({
  metric: { process_definition_key: key },
  value,
})

/**
 * Ordered dispatch table for the mock client: first predicate match wins, so
 * the specific rules (activity-level, then definition-level breakdowns) sit
 * before the global-KPI fallbacks — the same precedence the former if-chain
 * had. A definition-grouped query matching no definition rule still falls
 * through to the globals, exactly like before.
 */
const CANNED_SAMPLES: Array<[(q: string) => boolean, PromSample[]]> = [
  // Activity-level breakdowns
  [
    (q) => q.includes("camunda_activity_ended_total") && q.includes("activity_type"),
    [
      { metric: { activity_id: "A", activity_type: "serviceTask" }, value: 10 },
      { metric: { activity_id: "B", activity_type: "userTask" }, value: 5 },
    ],
  ],
  [
    (q) => q.includes("camunda_activity_ended_total"),
    [
      { metric: { activity_id: "A" }, value: 10 },
      { metric: { activity_id: "B" }, value: 5 },
    ],
  ],
  [
    (q) => q.includes("camunda_activity_duration_seconds_sum"),
    [
      { metric: { activity_id: "A" }, value: 100 },
      { metric: { activity_id: "B" }, value: 20 },
    ],
  ],
  [
    (q) => q.includes("activity_id, le"),
    [
      { metric: { activity_id: "A" }, value: 15 },
      { metric: { activity_id: "B" }, value: 6 },
    ],
  ],
  // Definition-level breakdowns
  [
    (q) => q.includes("by (process_definition_key)") && q.includes("incident_created"),
    [def("order", 6)],
  ],
  [
    (q) => q.includes("by (process_definition_key)") && q.includes('state="COMPLETED"'),
    [def("order", 50), def("invoice", 20)],
  ],
  [
    (q) => q.includes("by (process_definition_key)") && q.includes("ended_total"),
    [def("order", 55), def("invoice", 25)],
  ],
  [
    (q) => q.includes("by (process_definition_key)") && q.includes("started_total"),
    [def("order", 60), def("invoice", 40)],
  ],
  [
    (q) => q.includes("by (process_definition_key)") && q.includes("duration_seconds_sum"),
    [def("order", 600), def("invoice", 80)],
  ],
  [
    (q) => q.includes("by (process_definition_key)") && q.includes("duration_seconds_count"),
    [def("order", 50), def("invoice", 20)],
  ],
  // Global KPIs
  [(q) => q.includes("histogram_quantile(0.5"), [v(8)]],
  [(q) => q.includes("histogram_quantile(0.95"), [v(30)]],
  [(q) => q.includes("incident_resolved"), [v(4)]],
  [(q) => q.includes("incident_created"), [v(10)]],
  [(q) => q.includes('state="COMPLETED"'), [v(70)]],
  [(q) => q.includes("ended_total"), [v(80)]],
  [(q) => q.includes("started_total"), [v(100)]],
  [(q) => q.includes("duration_seconds_sum"), [v(12)]], // avg = sum/count expression
]

/** Mock Prometheus client that dispatches canned samples by the PromQL it sees. */
function mockClient() {
  const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
    const hit = CANNED_SAMPLES.find(([matches]) => matches(q))
    return hit ? hit[1] : []
  })
  const ch: PrometheusClient = { instant }
  return { ch, instant }
}

describe("dashboardData", () => {
  it("maps the metric samples into KPIs and breakdowns", async () => {
    const { ch } = mockClient()
    const res = await dashboardData(ch, { period: "7d" })

    expect(res).toMatchObject({
      totalCount: 100,
      completedCount: 70,
      runningCount: 20, // started − ended
      failedCount: 10, // incident-based
      incidentCount: 6, // created − resolved
      failureRatePct: 10,
      avgDurationMs: 12000,
      medianDurationMs: 8000,
      p95DurationMs: 30000,
    })

    // Activities ranked by total time, durations in integer milliseconds.
    expect(res.activityBreakdown).toEqual([
      {
        activityId: "A",
        activityName: "",
        activityType: "serviceTask",
        executionCount: 10,
        avgDurationMs: 10000,
        p95DurationMs: 15000,
        totalTimeMs: 100000,
      },
      {
        activityId: "B",
        activityName: "",
        activityType: "userTask",
        executionCount: 5,
        avgDurationMs: 4000,
        p95DurationMs: 6000,
        totalTimeMs: 20000,
      },
    ])

    // Definitions ranked by total instances; `running` derived, `failed` incident-based.
    expect(res.definitionBreakdown).toEqual([
      {
        processDefinitionKey: "order",
        totalInstances: 60,
        completed: 50,
        running: 5,
        failed: 6,
        avgDurationMs: 12000,
      },
      {
        processDefinitionKey: "invoice",
        totalInstances: 40,
        completed: 20,
        running: 15,
        failed: 0,
        avgDurationMs: 4000,
      },
    ])
  })

  it("degrades durations to null and rates to 0 when no samples exist", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    const res = await dashboardData({ instant }, { period: "1d" })

    expect(res.totalCount).toBe(0)
    expect(res.failureRatePct).toBe(0)
    expect(res.avgDurationMs).toBeNull()
    expect(res.medianDurationMs).toBeNull()
    expect(res.p95DurationMs).toBeNull()
    expect(res.activityBreakdown).toEqual([])
    expect(res.definitionBreakdown).toEqual([])
  })

  it("scopes every query to the definition key, engine filter and period", async () => {
    const { ch, instant } = mockClient()
    await dashboardData(ch, {
      processDefinitionKey: "myKey",
      period: "30d",
      engine: "prod-a",
    })

    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every((q) => q.includes('process_definition_key="myKey"'))).toBe(true)
    expect(queries.every((q) => q.includes('engine_id="prod-a"'))).toBe(true)
    expect(queries.every((q) => q.includes("[30d]"))).toBe(true)
  })
})

describe("failureDashboardData", () => {
  it("builds error patterns and the per-process breakdown from the live gauges", async () => {
    const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
      if (q.includes("incident_type")) {
        return [
          {
            metric: { process_definition_key: "order", incident_type: "failedJob" },
            value: 7,
          },
          {
            metric: { process_definition_key: "invoice", incident_type: "failedExternalTask" },
            value: 2,
          },
          // Zero-count patterns are dropped.
          { metric: { process_definition_key: "order", incident_type: "noise" }, value: 0 },
        ]
      }
      if (q.includes("camunda_incidents_open")) {
        return [
          { metric: { process_definition_key: "order" }, value: 7 },
          { metric: { process_definition_key: "invoice" }, value: 2 },
        ]
      }
      if (q.includes("camunda_jobs_failed")) {
        return [{ metric: { process_definition_key: "order" }, value: 3 }]
      }
      // camunda_process_instances_running
      return [
        { metric: { process_definition_key: "order" }, value: 70 },
        { metric: { process_definition_key: "invoice" }, value: 10 },
      ]
    })

    const res = await failureDashboardData({ instant }, {})

    expect(res.totalIncidents).toBe(9)
    expect(res.uniqueErrorPatterns).toBe(2)
    expect(res.mostAffectedProcess).toBe("order")
    expect(res.errorPatterns.map((p) => [p.incidentMessage, p.incidentCount])).toEqual([
      ["failedJob", 7],
      ["failedExternalTask", 2],
    ])
    expect(res.processBreakdown).toEqual([
      {
        processDefinitionKey: "order",
        totalInstances: 70,
        failedCount: 3,
        incidentCount: 7,
        failureRatePct: 10,
      },
      {
        processDefinitionKey: "invoice",
        totalInstances: 10,
        failedCount: 0,
        incidentCount: 2,
        failureRatePct: 20,
      },
    ])
  })

  it("computes totals over ALL patterns while capping the list at the top 50", async () => {
    // 60 distinct patterns, counts 60..1 — the KPI must not stop at the cap.
    const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
      if (q.includes("incident_type")) {
        return Array.from({ length: 60 }, (_, i) => ({
          metric: { process_definition_key: `proc-${i}`, incident_type: `type-${i}` },
          value: 60 - i,
        }))
      }
      return []
    })

    const res = await failureDashboardData({ instant }, {})

    expect(res.errorPatterns).toHaveLength(50)
    expect(res.uniqueErrorPatterns).toBe(60)
    // 60+59+…+1 = 1830, including the 10 sliced-off tail patterns.
    expect(res.totalIncidents).toBe(1830)
    expect(res.errorPatterns[0].incidentCount).toBe(60)
  })
})
