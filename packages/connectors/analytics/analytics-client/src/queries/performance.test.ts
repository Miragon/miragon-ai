import { describe, expect, it, vi } from "vitest"
import { analyzePerformance, comparePeriods } from "./performance.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })

/** Mock Prometheus client that dispatches canned samples by the PromQL it sees. */
function mockClient() {
  const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
    if (q.includes("camunda_activity_ended_total")) {
      return [
        { metric: { activity_id: "A", activity_type: "serviceTask" }, value: 10 },
        { metric: { activity_id: "B", activity_type: "userTask" }, value: 4 },
      ]
    }
    if (q.includes("camunda_activity_duration_seconds_sum")) {
      return [
        { metric: { activity_id: "A" }, value: 100 },
        { metric: { activity_id: "B" }, value: 10 },
      ]
    }
    if (q.includes("activity_id, le")) {
      return [
        { metric: { activity_id: "A" }, value: 15 },
        { metric: { activity_id: "B" }, value: 5 },
      ]
    }
    if (q.includes("histogram_quantile(0.5")) return [v(8)]
    if (q.includes("histogram_quantile(0.95")) return [v(20)]
    if (q.includes("incident_created")) return [v(5)]
    if (q.includes('state="COMPLETED"')) return [v(40)]
    if (q.includes("started_total")) return [v(50)]
    if (q.includes("duration_seconds_sum")) return [v(10.04)] // avg = sum/count expression
    return []
  })
  const ch: PrometheusClient = { instant }
  return { ch, instant }
}

describe("analyzePerformance", () => {
  it("maps counts, incident-based failures and rounded durations into the KPI", async () => {
    const { ch } = mockClient()
    const res = await analyzePerformance(ch, {
      processDefinitionKey: "order",
      period: "7d",
      includeActivityBreakdown: true,
    })

    expect(res.kpi).toEqual({
      process_definition_key: "order",
      total_instances: 50,
      completed: 40,
      failed: 5,
      failure_rate_pct: 10,
      avg_duration_sec: 10, // 10.04 rounded to one decimal
      median_duration_sec: 8,
      p95_duration_sec: 20,
      earliest: "", // not available on metrics
      latest: "",
    })

    // Ranked by total time; names degrade to null on metrics.
    expect(res.activityBreakdown).toEqual([
      {
        activity_id: "A",
        activity_name: null,
        activity_type: "serviceTask",
        execution_count: 10,
        avg_duration_sec: 10,
        median_duration_sec: 0,
        p95_duration_sec: 15,
        total_time_sec: 100,
      },
      {
        activity_id: "B",
        activity_name: null,
        activity_type: "userTask",
        execution_count: 4,
        avg_duration_sec: 2.5,
        median_duration_sec: 0,
        p95_duration_sec: 5,
        total_time_sec: 10,
      },
    ])
  })

  it("returns a null KPI (no fabricated zeros) when the window has no instances", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    const res = await analyzePerformance(
      { instant },
      { processDefinitionKey: "order", period: "7d", includeActivityBreakdown: false },
    )
    expect(res.kpi).toBeNull()
    expect(res.activityBreakdown).toEqual([])
  })

  it("skips the breakdown queries when includeActivityBreakdown is false", async () => {
    const { ch, instant } = mockClient()
    await analyzePerformance(ch, {
      processDefinitionKey: "order",
      period: "7d",
      includeActivityBreakdown: false,
    })
    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries).toHaveLength(6)
    expect(queries.some((q) => q.includes("camunda_activity_"))).toBe(false)
  })
})

describe("comparePeriods", () => {
  const PERIOD_A = { from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" }
  const PERIOD_B = { from: "2026-02-01T00:00:00Z", to: "2026-02-03T00:00:00Z" }
  const AT_A = `@ ${Date.parse(PERIOD_A.to) / 1000}`

  it("labels both windows and resolves each KPI from its own historical window", async () => {
    const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
      const base = q.includes(AT_A) ? 10 : 30
      if (q.includes("histogram_quantile")) return [v(base / 10)]
      if (q.includes("duration_seconds_sum")) return [v(base / 10)]
      if (q.includes("incident_created")) return [v(1)]
      if (q.includes('state="COMPLETED"')) return [v(base - 2)]
      return [v(base)]
    })

    const res = await comparePeriods(
      { instant },
      {
        processDefinitionKey: "order",
        periodAFrom: PERIOD_A.from,
        periodATo: PERIOD_A.to,
        periodBFrom: PERIOD_B.from,
        periodBTo: PERIOD_B.to,
        includeActivityBreakdown: false,
      },
    )

    expect(res.activityComparison).toBeUndefined()
    expect(res.kpiComparison).toEqual([
      {
        period: "Period A",
        total_instances: 10,
        completed: 8,
        failed: 1,
        failure_rate_pct: 10,
        avg_duration_sec: 1,
        median_sec: 1,
        p95_sec: 1,
      },
      {
        period: "Period B",
        total_instances: 30,
        completed: 28,
        failed: 1,
        failure_rate_pct: 3.3,
        avg_duration_sec: 3,
        median_sec: 3,
        p95_sec: 3,
      },
    ])
  })

  it("rejects unparsable period timestamps before any PromQL is sent", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])

    await expect(
      comparePeriods(
        { instant },
        {
          processDefinitionKey: "order",
          periodAFrom: "last week",
          periodATo: PERIOD_A.to,
          periodBFrom: PERIOD_B.from,
          periodBTo: PERIOD_B.to,
          includeActivityBreakdown: false,
        },
      ),
    ).rejects.toThrow(/periodAFrom "last week" is not a parseable ISO datetime/)
    expect(instant).not.toHaveBeenCalled()
  })

  it("sorts the optional activity comparison by activity id, then period", async () => {
    const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
      if (q.includes("camunda_activity_ended_total")) {
        return [
          { metric: { activity_id: "B" }, value: 2 },
          { metric: { activity_id: "A" }, value: 4 },
        ]
      }
      if (q.includes("camunda_activity_duration_seconds_sum")) {
        return [{ metric: { activity_id: "A" }, value: 8 }]
      }
      if (q.includes("activity_id, le")) {
        return [{ metric: { activity_id: "A" }, value: 3 }]
      }
      return []
    })

    const res = await comparePeriods(
      { instant },
      {
        processDefinitionKey: "order",
        periodAFrom: PERIOD_A.from,
        periodATo: PERIOD_A.to,
        periodBFrom: PERIOD_B.from,
        periodBTo: PERIOD_B.to,
        includeActivityBreakdown: true,
      },
    )

    expect(
      res.activityComparison!.map((r) => [r.activity_id, r.period, r.executions, r.avg_sec]),
    ).toEqual([
      ["A", "Period A", 4, 2],
      ["A", "Period B", 4, 2],
      ["B", "Period A", 2, 0],
      ["B", "Period B", 2, 0],
    ])
  })
})
