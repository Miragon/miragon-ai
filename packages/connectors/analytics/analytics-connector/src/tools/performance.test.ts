import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { createEngineScope } from "../engine-ids.js"
import { registerPerformanceTools } from "./performance.js"

const scope = createEngineScope(["prod-a", "prod-b"])
const register = (r: never) => registerPerformanceTools(r, scope)

type Handler = ToolConfig<PrometheusClient>["handler"]

/** Registrar stand-in that captures each tool's handler instead of an MCPServer. */
function captureHandlers(registerModule: (register: never) => void): Map<string, Handler> {
  const handlers = new Map<string, Handler>()
  const register = Object.assign(
    (config: ToolConfig<PrometheusClient>) => {
      handlers.set(config.name, config.handler)
    },
    { getRegisteredTools: (): RegisteredToolMeta[] => [] },
  )
  registerModule(register as never)
  return handlers
}

/** PrometheusClient that records every instant PromQL string and returns no samples. */
function recordingClient(): { client: PrometheusClient; queries: string[] } {
  const queries: string[] = []
  return {
    client: {
      instant: (query: string) => {
        queries.push(query)
        return Promise.resolve([])
      },
    },
    queries,
  }
}

describe("analytics_analyze_process_performance PromQL", () => {
  it("emits the exact KPI + activity-breakdown queries, scoped to key and engine", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_analyze_process_performance")!(client, {
      processDefinitionKey: "order",
      period: "7d",
      includeActivityBreakdown: true,
      engine: "prod-a",
    })

    const sel = '{process_definition_key="order",engine_id="prod-a"}'
    const completedSel = '{process_definition_key="order",engine_id="prod-a",state="COMPLETED"}'
    expect(queries).toEqual([
      `sum(increase(camunda_process_instance_started_total${sel}[7d]))`,
      `sum(increase(camunda_process_instance_ended_total${completedSel}[7d]))`,
      `sum(increase(camunda_incident_created_total${sel}[7d]))`,
      `sum(increase(camunda_process_instance_duration_seconds_sum${sel}[7d])) / sum(increase(camunda_process_instance_duration_seconds_count${sel}[7d]))`,
      `histogram_quantile(0.5, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}[7d])))`,
      `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}[7d])))`,
      `sum by (activity_id, activity_type)(increase(camunda_activity_ended_total${sel}[7d]))`,
      `sum by (activity_id)(increase(camunda_activity_duration_seconds_sum${sel}[7d]))`,
      `histogram_quantile(0.5, sum by (activity_id, le)(increase(camunda_activity_duration_seconds_bucket${sel}[7d])))`,
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(camunda_activity_duration_seconds_bucket${sel}[7d])))`,
    ])
  })

  it("skips the activity-breakdown queries; engine omitted reads the configured fleet", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_analyze_process_performance")!(client, {
      processDefinitionKey: "order",
      period: "30d",
      includeActivityBreakdown: false,
    })

    expect(queries).toHaveLength(6)
    expect(queries.every((q) => q.includes('process_definition_key="order"'))).toBe(true)
    expect(queries.every((q) => q.includes("[30d]"))).toBe(true)
    // Never every engine a shared Prometheus holds (N138).
    expect(queries.every((q) => q.includes('engine_id=~"prod-a|prod-b"'))).toBe(true)
    expect(queries.some((q) => q.includes("camunda_activity_"))).toBe(false)
  })
})

describe("analytics_compare_execution_periods PromQL", () => {
  // Explicit windows are clamped to [now − retention, now] — pin now.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-02-10T00:00:00Z") })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it("queries each period via `[duration] @ end` historical windows", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_compare_execution_periods")!(client, {
      processDefinitionKey: "order",
      periodAFrom: "2026-01-20T00:00:00Z",
      periodATo: "2026-01-21T00:00:00Z",
      periodBFrom: "2026-02-01T00:00:00Z",
      periodBTo: "2026-02-03T00:00:00Z",
      includeActivityBreakdown: false,
    })

    const windowA = `[86400s] @ ${Date.parse("2026-01-21T00:00:00Z") / 1000}`
    const windowB = `[172800s] @ ${Date.parse("2026-02-03T00:00:00Z") / 1000}`
    const fleet = 'engine_id=~"prod-a|prod-b"'
    // 6 KPI queries per period, period A first.
    expect(queries).toHaveLength(12)
    expect(queries.slice(0, 6).every((q) => q.includes(windowA))).toBe(true)
    expect(queries.slice(6).every((q) => q.includes(windowB))).toBe(true)
    expect(queries[0]).toBe(
      `sum(increase(camunda_process_instance_started_total{process_definition_key="order",${fleet}}${windowA}))`,
    )
    expect(queries[6]).toBe(
      `sum(increase(camunda_process_instance_started_total{process_definition_key="order",${fleet}}${windowB}))`,
    )
  })
})

describe("analytics_compare_execution_periods windows (N79)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-02-10T00:00:00Z") })
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  const base = { processDefinitionKey: "order", includeActivityBreakdown: false }

  it("clamps a window reaching past now to now and reports what was measured", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    const result = (await handlers.get("analytics_compare_execution_periods")!(client, {
      ...base,
      periodAFrom: "2026-02-01T00:00:00Z",
      periodATo: "2026-02-05T00:00:00Z",
      periodBFrom: "2026-02-05T00:00:00Z",
      periodBTo: "2026-02-15T00:00:00Z",
    })) as { kpiComparison: Array<{ window_to: string; window_days: number; partial: boolean }> }

    const now = Date.parse("2026-02-10T00:00:00Z") / 1000
    // No `@` anchor in the future: Prometheus would answer with the elapsed
    // part while the window is reported at full length.
    expect(queries.slice(6).every((q) => q.includes(`[432000s] @ ${now}`))).toBe(true)
    expect(result.kpiComparison[1]).toMatchObject({
      window_to: "2026-02-10T00:00:00.000Z",
      window_days: 5,
      partial: true,
    })
  })

  it("refuses a reversed window instead of measuring a 1-second one", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()
    await expect(
      handlers.get("analytics_compare_execution_periods")!(client, {
        ...base,
        periodAFrom: "2026-02-05T00:00:00Z",
        periodATo: "2026-02-01T00:00:00Z",
        periodBFrom: "2026-02-05T00:00:00Z",
        periodBTo: "2026-02-08T00:00:00Z",
      }),
    ).rejects.toThrow(/periodA: the window ends before it starts/)
    expect(queries).toEqual([])
  })

  it("refuses a window entirely before the retention", async () => {
    const handlers = captureHandlers(register)
    const { client } = recordingClient()
    await expect(
      handlers.get("analytics_compare_execution_periods")!(client, {
        ...base,
        periodAFrom: "2025-10-01T00:00:00Z",
        periodATo: "2025-10-08T00:00:00Z",
        periodBFrom: "2026-02-01T00:00:00Z",
        periodBTo: "2026-02-08T00:00:00Z",
      }),
    ).rejects.toThrow(/periodA: the window lies before the 30-day Prometheus retention/)
  })
})

describe("analytics_analyze_process_performance saved defaults", () => {
  it("resolves the CALLER's saved period from the handler ctx the registrar hands it", async () => {
    const store = {
      get: (key: string) =>
        Promise.resolve(
          key === "user-1" ? { modules: { analytics: { defaultPeriod: "30d" } } } : undefined,
        ),
    }
    const handlers = captureHandlers((r) => registerPerformanceTools(r, scope, store))
    const handler = handlers.get("analytics_analyze_process_performance")!
    const firstQueryFor = async (ctx?: unknown) => {
      const { client, queries } = recordingClient()
      await handler(client, { processDefinitionKey: "order" }, ctx as never)
      return queries[0]
    }

    expect(await firstQueryFor({ auth: { user: { id: "user-1" } } })).toContain("[30d]")
    // Another caller, and a request without any identity, get the schema default.
    expect(await firstQueryFor({ auth: { user: { id: "user-2" } } })).toContain("[7d]")
    expect(await firstQueryFor()).toContain("[7d]")
  })
})
