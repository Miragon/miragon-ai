import { describe, expect, it, vi } from "vitest"
import {
  VERSION_ACTIVITY_SCOPE_NOTE,
  VERSION_INCIDENT_KPIS_NOTE,
  versionCompare,
} from "./version-compare.js"
import type { PrometheusClient, PromSample } from "../prometheus.js"

const v = (value: number): PromSample => ({ metric: {}, value })

type Canned = { started: number; completed: number; avg: number; p95: number }

/** Mock Prometheus client with distinct canned KPIs per process_definition_version. */
function mockClient(byVersion: Record<string, Canned>) {
  const answer = (q: string): PromSample[] => {
    const version = /process_definition_version="(\d+)"/.exec(q)?.[1] ?? ""
    const kpi = byVersion[version]
    if (!kpi) return []
    if (q.includes("histogram_quantile")) return [v(kpi.p95)]
    if (q.includes("duration_seconds_sum")) return [v(kpi.avg)]
    if (q.includes('state="COMPLETED"')) return [v(kpi.completed)]
    return [v(kpi.started)]
  }
  const instant = vi.fn((q: string) => Promise.resolve(answer(q)))
  const ch: PrometheusClient = { instant }
  return { ch, instant, sent: () => instant.mock.calls.map((c) => c[0]) }
}

const base = {
  processDefinitionKey: "order",
  versionA: 1,
  versionB: 2,
  windowDays: 14,
  minBucketSize: 10,
}

const versions = {
  "1": { started: 99.6, completed: 80.4, avg: 10.04, p95: 20 },
  "2": { started: 50, completed: 40, avg: 12.06, p95: 30 },
}

describe("versionCompare", () => {
  it("partitions the process-instance series by version and sends no incident query", async () => {
    const { ch, sent } = mockClient(versions)
    await versionCompare(ch, { ...base, engine: "prod-a" })

    const sel = (ver: number, extra = "") =>
      `{process_definition_key="order",process_definition_version="${ver}"${extra},engine_id="prod-a"}`
    const queries = (ver: number) => [
      `sum(increase(camunda_process_instance_started_total${sel(ver)}[14d]))`,
      `sum(increase(camunda_process_instance_ended_total${sel(ver, ',state="COMPLETED"')}[14d]))`,
      `sum(increase(camunda_process_instance_duration_seconds_sum${sel(ver)}[14d])) / sum(increase(camunda_process_instance_duration_seconds_count${sel(ver)}[14d]))`,
      `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel(ver)}[14d])))`,
    ]
    // The incident counter has no version label — querying it would match
    // nothing and read as 0 (#327).
    expect(sent()).toEqual([...queries(1), ...queries(2)])
  })

  it("reports instance, completion and duration KPIs and nulls the incident family", async () => {
    const { ch } = mockClient(versions)
    const res = await versionCompare(ch, base)

    expect(res.kpis).toEqual([
      {
        version: 1,
        bucket: "versionA",
        instance_count: 100,
        completed_count: 80,
        failed_count: null,
        failure_rate_pct: null,
        incident_count: null,
        incident_rate_pct: null,
        avg_duration_sec: 10,
        p95_duration_sec: 20,
      },
      {
        version: 2,
        bucket: "versionB",
        instance_count: 50,
        completed_count: 40,
        failed_count: null,
        failure_rate_pct: null,
        incident_count: null,
        incident_rate_pct: null,
        avg_duration_sec: 12.1,
        p95_duration_sec: 30,
      },
    ])
    expect(res.delta).toEqual({
      instance_count_delta_pct: -50,
      failure_rate_delta_pp: null,
      incident_rate_delta_pp: null,
      avg_duration_delta_pct: 21,
      p95_duration_delta_pct: 50,
    })
    expect(res.notes).toEqual([VERSION_INCIDENT_KPIS_NOTE])
    // The note is what a model reads next to the nulls: it must name every
    // nulled field and say why, and that they are unknown rather than zero.
    expect(VERSION_INCIDENT_KPIS_NOTE).toContain(
      "failed_count, failure_rate_pct, incident_count, incident_rate_pct and their deltas are null",
    )
    expect(VERSION_INCIDENT_KPIS_NOTE).toContain("NOT zero")
    expect(VERSION_INCIDENT_KPIS_NOTE).toContain("no process_definition_version label")
    expect(VERSION_INCIDENT_KPIS_NOTE).toContain("cannot be attributed to a version")
    expect(VERSION_INCIDENT_KPIS_NOTE).toContain("per process definition key only")
  })

  it("echoes the request and explains that activityId scopes nothing", async () => {
    const { ch } = mockClient(versions)
    const res = await versionCompare(ch, { ...base, activityId: "Task_check" })

    expect(res).toMatchObject({
      processDefinitionKey: "order",
      versionA: 1,
      versionB: 2,
      windowDays: 14,
      activityId: "Task_check",
      minBucketSize: 10,
      suppressed: false,
    })
    expect(res.notes).toEqual([VERSION_INCIDENT_KPIS_NOTE, VERSION_ACTIVITY_SCOPE_NOTE])
    expect(VERSION_ACTIVITY_SCOPE_NOTE).toContain("activityId has no effect")
    expect((await versionCompare(ch, base)).activityId).toBeNull()
  })

  it("returns null deltas on a zero baseline instead of dividing by zero", async () => {
    const { ch } = mockClient({ "2": versions["2"] })
    const res = await versionCompare(ch, { ...base, minBucketSize: 1 })

    expect(res.kpis[0]).toMatchObject({ instance_count: 0, avg_duration_sec: 0 })
    expect(res.delta.instance_count_delta_pct).toBeNull()
    expect(res.delta.avg_duration_delta_pct).toBeNull()
    expect(res.delta.p95_duration_delta_pct).toBeNull()
    expect(res.suppressed).toBe(true)
  })

  it.each([
    [{ "1": 50, "2": 50 }, 50, false],
    [{ "1": 49, "2": 50 }, 50, true],
    [{ "1": 50, "2": 49 }, 50, true],
  ])("suppresses below minBucketSize per version (%j, min %i)", async (counts, min, expected) => {
    const canned = (started: number) => ({ started, completed: 0, avg: 1, p95: 1 })
    const { ch } = mockClient({ "1": canned(counts["1"]), "2": canned(counts["2"]) })
    const res = await versionCompare(ch, { ...base, minBucketSize: min })
    expect(res.suppressed).toBe(expected)
  })

  it("floors and clamps the numeric inputs to sane minimums", async () => {
    const { ch, sent } = mockClient(versions)
    const res = await versionCompare(ch, {
      ...base,
      versionA: 0,
      versionB: 2.9,
      windowDays: 0.5,
      minBucketSize: 0,
    })

    expect(res).toMatchObject({ versionA: 1, versionB: 2, windowDays: 1, minBucketSize: 1 })
    expect(res.kpis.map((k) => k.version)).toEqual([1, 2])
    expect(sent().every((q) => q.includes("[1d]"))).toBe(true)

    const floored = await versionCompare(ch, { ...base, windowDays: 7.9, minBucketSize: 2.7 })
    expect(floored).toMatchObject({ windowDays: 7, minBucketSize: 2 })
  })

  it("escapes the key and applies a multi-engine filter to every query", async () => {
    const { ch, sent } = mockClient(versions)
    await versionCompare(ch, {
      ...base,
      processDefinitionKey: 'my"key',
      engine: ["prod-a", "prod-b"],
    })

    expect(sent()).toHaveLength(8)
    expect(sent().every((q) => q.includes('process_definition_key="my\\"key"'))).toBe(true)
    expect(sent().every((q) => q.includes('engine_id=~"prod-a|prod-b"'))).toBe(true)
  })

  it("aggregates across engines when no engine filter is given", async () => {
    const { ch, sent } = mockClient(versions)
    await versionCompare(ch, base)
    expect(sent().some((q) => q.includes("engine_id"))).toBe(false)
  })
})
