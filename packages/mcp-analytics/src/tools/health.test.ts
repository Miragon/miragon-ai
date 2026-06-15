import { describe, expect, it } from "vitest"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerHealthTools } from "./health.js"

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

describe("analytics_engine_health PromQL", () => {
  it("emits the exact gauge + ALERTS queries scoped to the engine filter", async () => {
    const handlers = captureHandlers(registerHealthTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_health")!(client, { engine: "prod-a" })

    const sel = '{engine_id="prod-a"}'
    expect(queries).toEqual([
      `camunda_process_instances_running${sel}`,
      `sum by (incident_type)(camunda_incidents_open${sel})`,
      `sum(camunda_jobs_failed${sel})`,
      `sum(camunda_jobs_executable${sel})`,
      `sum(camunda_jobs_suspended${sel})`,
      `sum(camunda_usertasks_open{status="total",engine_id="prod-a"})`,
      `sum(camunda_usertasks_open{status="unassigned",engine_id="prod-a"})`,
      `sum(camunda_external_tasks_open${sel})`,
      `count(camunda_process_definitions_deployed${sel})`,
      `ALERTS{alertstate="firing",engine_id="prod-a"}`,
      `ALERTS{alertstate="pending",engine_id="prod-a"}`,
    ])
  })

  it("aggregates across all engines when no filter is set", async () => {
    const handlers = captureHandlers(registerHealthTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_health")!(client, {})

    expect(queries).toEqual([
      "camunda_process_instances_running",
      "sum by (incident_type)(camunda_incidents_open)",
      "sum(camunda_jobs_failed)",
      "sum(camunda_jobs_executable)",
      "sum(camunda_jobs_suspended)",
      'sum(camunda_usertasks_open{status="total"})',
      'sum(camunda_usertasks_open{status="unassigned"})',
      "sum(camunda_external_tasks_open)",
      "count(camunda_process_definitions_deployed)",
      'ALERTS{alertstate="firing"}',
      'ALERTS{alertstate="pending"}',
    ])
  })

  it("expands an engine-id list into a regex matcher", async () => {
    const handlers = captureHandlers(registerHealthTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_health")!(client, { engine: ["prod-a", "prod-b"] })

    expect(queries[0]).toBe('camunda_process_instances_running{engine_id=~"prod-a|prod-b"}')
    expect(queries.every((q) => q.includes('engine_id=~"prod-a|prod-b"'))).toBe(true)
  })
})
