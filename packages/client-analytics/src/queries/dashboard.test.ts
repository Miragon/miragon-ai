import { describe, expect, it, vi } from "vitest"
import { dashboardData, failureDashboardData } from "./dashboard.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })

/** Mock Prometheus client that dispatches canned samples by the PromQL it sees. */
function mockClient() {
  const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
    // Activity-level breakdowns
    if (q.includes("camunda_activity_ended_total")) {
      if (q.includes("activity_type")) {
        return [
          { metric: { activity_id: "A", activity_type: "serviceTask" }, value: 10 },
          { metric: { activity_id: "B", activity_type: "userTask" }, value: 5 },
        ]
      }
      return [
        { metric: { activity_id: "A" }, value: 10 },
        { metric: { activity_id: "B" }, value: 5 },
      ]
    }
    if (q.includes("camunda_activity_duration_seconds_sum")) {
      return [
        { metric: { activity_id: "A" }, value: 100 },
        { metric: { activity_id: "B" }, value: 20 },
      ]
    }
    if (q.includes("activity_id, le")) {
      return [
        { metric: { activity_id: "A" }, value: 15 },
        { metric: { activity_id: "B" }, value: 6 },
      ]
    }
    // Definition-level breakdowns
    if (q.includes("by (process_definition_key)")) {
      const def = (key: string, value: number) => ({
        metric: { process_definition_key: key },
        value,
      })
      if (q.includes("incident_created")) return [def("order", 6)]
      if (q.includes('state="COMPLETED"')) return [def("order", 50), def("invoice", 20)]
      if (q.includes("ended_total")) return [def("order", 55), def("invoice", 25)]
      if (q.includes("started_total")) return [def("order", 60), def("invoice", 40)]
      if (q.includes("duration_seconds_sum")) return [def("order", 600), def("invoice", 80)]
      if (q.includes("duration_seconds_count")) return [def("order", 50), def("invoice", 20)]
    }
    // Global KPIs
    if (q.includes("histogram_quantile(0.5")) return [v(8)]
    if (q.includes("histogram_quantile(0.95")) return [v(30)]
    if (q.includes("incident_resolved")) return [v(4)]
    if (q.includes("incident_created")) return [v(10)]
    if (q.includes('state="COMPLETED"')) return [v(70)]
    if (q.includes("ended_total")) return [v(80)]
    if (q.includes("started_total")) return [v(100)]
    if (q.includes("duration_seconds_sum")) return [v(12)] // avg = sum/count expression
    return []
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
})
