import { describe, expect, it, vi } from "vitest"
import { dashboardData, failureDashboardData } from "./dashboard.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })
const def = (key: string, value: number): PromSample => ({
  metric: { process_definition_key: key },
  value,
})
const act = (key: string, id: string, value: number, type?: string): PromSample => ({
  metric: {
    process_definition_key: key,
    activity_id: id,
    ...(type ? { activity_type: type } : {}),
  },
  value,
})

const BY_KEY = "by (process_definition_key)"

/**
 * Ordered dispatch table for the mock client: first predicate match wins, so
 * the specific rules (activity-level, then definition-level breakdowns, then
 * the live gauges) sit before the global-KPI fallbacks.
 */
const CANNED_SAMPLES: Array<[(q: string) => boolean, PromSample[]]> = [
  // Activity-level breakdowns — `StartEvent_1` exists in two processes.
  [
    (q) => q.includes("camunda_activity_ended_total"),
    [
      act("order", "Task_A", 10, "serviceTask"),
      act("order", "Task_B", 5, "userTask"),
      act("order", "StartEvent_1", 60, "startEvent"),
      act("invoice", "StartEvent_1", 40, "startEvent"),
    ],
  ],
  [
    (q) => q.includes("camunda_activity_duration_seconds_sum"),
    [act("order", "Task_A", 100), act("order", "Task_B", 20), act("invoice", "StartEvent_1", 4)],
  ],
  [(q) => q.includes("activity_id, le"), [act("order", "Task_A", 15), act("order", "Task_B", 6)]],
  // Definition-level breakdowns
  [(q) => q.includes(BY_KEY) && q.includes("incident_created"), [def("order", 6)]],
  [
    (q) => q.includes(BY_KEY) && q.includes('state="COMPLETED"'),
    [def("order", 50), def("invoice", 20)],
  ],
  [
    (q) => q.includes(BY_KEY) && q.includes("started_total"),
    [def("order", 60), def("invoice", 40)],
  ],
  [
    (q) => q.includes(BY_KEY) && q.includes("duration_seconds_sum"),
    [def("order", 600), def("invoice", 80)],
  ],
  [
    (q) => q.includes(BY_KEY) && q.includes("duration_seconds_count"),
    [def("order", 50), def("invoice", 20)],
  ],
  // A long-running process with no start in the window still runs NOW.
  [
    (q) => q.includes(BY_KEY) && q.includes("process_instances_running"),
    [def("order", 120), def("invoice", 30), def("longRunning", 6)],
  ],
  // Live gauges, independent of the window
  [(q) => q.includes("process_instances_running"), [v(156)]],
  [(q) => q.includes("incidents_open"), [v(12)]],
  // Global KPIs
  [(q) => q.includes("histogram_quantile(0.5"), [v(8)]],
  [(q) => q.includes("histogram_quantile(0.95"), [v(30)]],
  [(q) => q.includes("incident_resolved"), [v(4)]],
  [(q) => q.includes("incident_created"), [v(10)]],
  [(q) => q.includes('state="COMPLETED"'), [v(70)]],
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
  it("separates window flows from the live state and echoes its scope", async () => {
    const { ch } = mockClient()
    const res = await dashboardData(ch, { period: "7d", engine: ["prod-a", "prod-b"] })

    expect(res).toMatchObject({
      processDefinitionKey: null,
      period: "7d",
      engines: ["prod-a", "prod-b"],
      // Flows within the window
      totalCount: 100,
      completedCount: 70,
      incidentsCreated: 10,
      incidentsResolved: 4,
      incidentRatePct: 10,
      avgDurationMs: 12000,
      medianDurationMs: 8000,
      p95DurationMs: 30000,
      // Live gauges — NOT started − ended (would be 30) nor created − resolved (6)
      runningNow: 156,
      openIncidentsNow: 12,
    })
  })

  it("groups the activity breakdown by (process, activity) — ids repeat across models (N84)", async () => {
    const { ch } = mockClient()
    const res = await dashboardData(ch, { period: "7d" })

    expect(res.activityBreakdown).toEqual([
      {
        processDefinitionKey: "order",
        activityId: "Task_A",
        activityType: "serviceTask",
        executionCount: 10,
        avgDurationMs: 10000,
        p95DurationMs: 15000,
        totalTimeMs: 100000,
      },
      {
        processDefinitionKey: "order",
        activityId: "Task_B",
        activityType: "userTask",
        executionCount: 5,
        avgDurationMs: 4000,
        p95DurationMs: 6000,
        totalTimeMs: 20000,
      },
      {
        processDefinitionKey: "invoice",
        activityId: "StartEvent_1",
        activityType: "startEvent",
        executionCount: 40,
        avgDurationMs: 100,
        p95DurationMs: null,
        totalTimeMs: 4000,
      },
      {
        // Executions but no duration series: unmeasured, not 0 ms.
        processDefinitionKey: "order",
        activityId: "StartEvent_1",
        activityType: "startEvent",
        executionCount: 60,
        avgDurationMs: null,
        p95DurationMs: null,
        totalTimeMs: 0,
      },
    ])
  })

  it("reads the per-definition running count from the live gauge, keeping long-running keys", async () => {
    const { ch } = mockClient()
    const res = await dashboardData(ch, { period: "7d" })

    expect(res.definitionBreakdown).toEqual([
      {
        processDefinitionKey: "order",
        totalInstances: 60,
        completed: 50,
        runningNow: 120,
        incidentsCreated: 6,
        avgDurationMs: 12000,
      },
      {
        processDefinitionKey: "invoice",
        totalInstances: 40,
        completed: 20,
        runningNow: 30,
        incidentsCreated: 0,
        avgDurationMs: 4000,
      },
      {
        processDefinitionKey: "longRunning",
        totalInstances: 0,
        completed: 0,
        runningNow: 6,
        incidentsCreated: 0,
        avgDurationMs: null,
      },
    ])
  })

  it("reports durations, rates and the live state as unmeasured when no samples exist", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    const res = await dashboardData({ instant }, { period: "1d" })

    expect(res).toMatchObject({
      totalCount: 0,
      incidentRatePct: null,
      avgDurationMs: null,
      medianDurationMs: null,
      p95DurationMs: null,
      runningNow: null,
      openIncidentsNow: null,
      engines: null,
      activityBreakdown: [],
      definitionBreakdown: [],
    })
  })

  it("lets an incident rate exceed 100 % rather than capping it — incidents are not instances", async () => {
    const instant = vi.fn(async (q: string): Promise<PromSample[]> =>
      q.includes("incident_created") ? [v(30)] : q.includes("started_total") ? [v(10)] : [],
    )
    const res = await dashboardData({ instant }, { period: "1d" })
    expect(res.incidentRatePct).toBe(300)
  })

  it("scopes every query to the definition key and engine filter, every flow to the period", async () => {
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
    // The live gauges are point-in-time: no range at all.
    const gauges = queries.filter((q) => !q.includes("increase("))
    expect(gauges).toEqual([
      'sum(camunda_process_instances_running{process_definition_key="myKey",engine_id="prod-a"})',
      'sum(camunda_incidents_open{process_definition_key="myKey",engine_id="prod-a"})',
      'sum by (process_definition_key)(camunda_process_instances_running{process_definition_key="myKey",engine_id="prod-a"})',
    ])
    const flows = queries.filter((q) => q.includes("increase("))
    expect(flows.every((q) => q.includes("[30d]"))).toBe(true)
  })
})

describe("failureDashboardData", () => {
  it("builds incident groups and the per-process breakdown from the live gauges", async () => {
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
          { metric: { process_definition_key: "stuck" }, value: 1 },
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

    const res = await failureDashboardData({ instant }, { engine: "prod-a" })

    expect(res.engines).toEqual(["prod-a"])
    expect(res.totalIncidents).toBe(9)
    expect(res.uniqueErrorPatterns).toBe(2)
    expect(res.mostAffectedProcess).toBe("order")
    // Only what the gauge carries — no activity, timestamps or sample ids.
    expect(res.errorPatterns).toEqual([
      { incidentType: "failedJob", processDefinitionKey: "order", incidentCount: 7 },
      { incidentType: "failedExternalTask", processDefinitionKey: "invoice", incidentCount: 2 },
    ])
    expect(res.processBreakdown).toEqual([
      {
        processDefinitionKey: "order",
        runningNow: 70,
        deadJobs: 3,
        openIncidents: 7,
        incidentRatePct: 10,
      },
      {
        processDefinitionKey: "invoice",
        runningNow: 10,
        deadJobs: 0,
        openIncidents: 2,
        incidentRatePct: 20,
      },
      {
        // Open incidents but nothing running reported: a rate of nothing is unmeasured.
        processDefinitionKey: "stuck",
        runningNow: 0,
        deadJobs: 0,
        openIncidents: 1,
        incidentRatePct: null,
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

    expect(res.engines).toBeNull()
    expect(res.errorPatterns).toHaveLength(50)
    expect(res.uniqueErrorPatterns).toBe(60)
    // 60+59+…+1 = 1830, including the 10 sliced-off tail patterns.
    expect(res.totalIncidents).toBe(1830)
    expect(res.errorPatterns[0].incidentCount).toBe(60)
  })
})
