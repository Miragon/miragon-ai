import { describe, expect, it } from "vitest"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerPerformanceTools } from "./performance.js"

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
    const handlers = captureHandlers(registerPerformanceTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_analyze_process_performance")!(client, {
      processDefinitionKey: "order",
      period: "7d",
      includeActivityBreakdown: true,
      engineId: "prod-a",
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
      `histogram_quantile(0.95, sum by (activity_id, le)(increase(camunda_activity_duration_seconds_bucket${sel}[7d])))`,
    ])
  })

  it("skips the activity-breakdown queries and engine matcher when not requested", async () => {
    const handlers = captureHandlers(registerPerformanceTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_analyze_process_performance")!(client, {
      processDefinitionKey: "order",
      period: "30d",
      includeActivityBreakdown: false,
    })

    expect(queries).toHaveLength(6)
    expect(queries.every((q) => q.includes('process_definition_key="order"'))).toBe(true)
    expect(queries.every((q) => q.includes("[30d]"))).toBe(true)
    expect(queries.some((q) => q.includes("engine_id"))).toBe(false)
    expect(queries.some((q) => q.includes("camunda_activity_"))).toBe(false)
  })
})

describe("analytics_compare_execution_periods PromQL", () => {
  it("queries each period via `[duration] @ end` historical windows", async () => {
    const handlers = captureHandlers(registerPerformanceTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_compare_execution_periods")!(client, {
      processDefinitionKey: "order",
      periodAFrom: "2026-01-01T00:00:00Z",
      periodATo: "2026-01-02T00:00:00Z",
      periodBFrom: "2026-02-01T00:00:00Z",
      periodBTo: "2026-02-03T00:00:00Z",
      includeActivityBreakdown: false,
    })

    const windowA = `[86400s] @ ${Date.parse("2026-01-02T00:00:00Z") / 1000}`
    const windowB = `[172800s] @ ${Date.parse("2026-02-03T00:00:00Z") / 1000}`
    // 6 KPI queries per period, period A first.
    expect(queries).toHaveLength(12)
    expect(queries.slice(0, 6).every((q) => q.includes(windowA))).toBe(true)
    expect(queries.slice(6).every((q) => q.includes(windowB))).toBe(true)
    expect(queries[0]).toBe(
      `sum(increase(camunda_process_instance_started_total{process_definition_key="order"}${windowA}))`,
    )
    expect(queries[6]).toBe(
      `sum(increase(camunda_process_instance_started_total{process_definition_key="order"}${windowB}))`,
    )
  })
})
