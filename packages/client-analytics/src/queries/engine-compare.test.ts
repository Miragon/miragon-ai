import { describe, expect, it, vi } from "vitest"
import { engineCompare } from "./engine-compare.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })

/** Mock Prometheus client with distinct canned KPIs per engine_id partition. */
function mockClient() {
  const byEngine = {
    "prod-a": { started: 100, completed: 80, incidents: 10, avg: 10, p95: 20 },
    "prod-b": { started: 50, completed: 40, incidents: 10, avg: 12, p95: 30 },
  }
  const instant = vi.fn(async (q: string): Promise<PromSample[]> => {
    const engine = q.includes('engine_id="prod-a"') ? byEngine["prod-a"] : byEngine["prod-b"]
    if (q.includes("histogram_quantile")) return [v(engine.p95)]
    if (q.includes("duration_seconds_sum")) return [v(engine.avg)]
    if (q.includes("incident_created")) return [v(engine.incidents)]
    if (q.includes('state="COMPLETED"')) return [v(engine.completed)]
    return [v(engine.started)]
  })
  const ch: PrometheusClient = { instant }
  return { ch, instant }
}

describe("engineCompare", () => {
  it("computes per-engine KPIs and the B-vs-A delta", async () => {
    const { ch } = mockClient()
    const res = await engineCompare(ch, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 14,
      minBucketSize: 10,
    })

    expect(res).toMatchObject({
      engineA: "prod-a",
      engineB: "prod-b",
      processDefinitionKey: null,
      windowDays: 14,
      elementId: null,
      minBucketSize: 10,
      suppressed: false,
    })
    expect(res.kpis).toEqual([
      {
        engineId: "prod-a",
        bucket: "engineA",
        instance_count: 100,
        completed_count: 80,
        failed_count: 10,
        failure_rate_pct: 10,
        incident_count: 10,
        incident_rate_pct: 10,
        avg_duration_sec: 10,
        p95_duration_sec: 20,
      },
      {
        engineId: "prod-b",
        bucket: "engineB",
        instance_count: 50,
        completed_count: 40,
        failed_count: 10,
        failure_rate_pct: 20,
        incident_count: 10,
        incident_rate_pct: 20,
        avg_duration_sec: 12,
        p95_duration_sec: 30,
      },
    ])
    expect(res.delta).toEqual({
      instance_count_delta_pct: -50,
      failure_rate_delta_pp: 10,
      incident_rate_delta_pp: 10,
      avg_duration_delta_pct: 20,
      p95_duration_delta_pct: 50,
    })
  })

  it("flags the comparison as suppressed when one engine misses minBucketSize", async () => {
    const { ch } = mockClient()
    const res = await engineCompare(ch, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 14,
      minBucketSize: 60, // prod-b only has 50 instances
    })
    expect(res.suppressed).toBe(true)
  })

  it("returns null deltas instead of dividing by a zero baseline", async () => {
    const instant = vi.fn(async (): Promise<PromSample[]> => [])
    const res = await engineCompare(
      { instant },
      { engineA: "prod-a", engineB: "prod-b", windowDays: 7, minBucketSize: 1 },
    )
    expect(res.suppressed).toBe(true)
    expect(res.delta.instance_count_delta_pct).toBeNull()
    expect(res.delta.avg_duration_delta_pct).toBeNull()
    expect(res.delta.p95_duration_delta_pct).toBeNull()
  })

  it("partitions every query by exactly one engine_id", async () => {
    const { ch, instant } = mockClient()
    await engineCompare(ch, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 14,
      processDefinitionKey: "order",
      minBucketSize: 10,
    })
    const queries = instant.mock.calls.map((c) => c[0])
    expect(queries).toHaveLength(12)
    const aQueries = queries.filter((q) => q.includes('engine_id="prod-a"'))
    const bQueries = queries.filter((q) => q.includes('engine_id="prod-b"'))
    expect(aQueries).toHaveLength(6)
    expect(bQueries).toHaveLength(6)
    expect(queries.every((q) => q.includes('process_definition_key="order"'))).toBe(true)
    expect(queries.every((q) => q.includes("[14d]"))).toBe(true)
  })
})
