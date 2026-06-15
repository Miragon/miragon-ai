import { describe, expect, it } from "vitest"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerEngineCompareTools } from "./engine-compare.js"

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

function kpiQueries(sel: string, completedSel: string, incidentSel: string, range: string) {
  return [
    `sum(increase(camunda_process_instance_started_total${sel}[${range}]))`,
    `sum(increase(camunda_process_instance_ended_total${completedSel}[${range}]))`,
    `sum(increase(camunda_incident_created_total${sel}[${range}]))`,
    `sum(increase(camunda_incident_created_total${incidentSel}[${range}]))`,
    `sum(increase(camunda_process_instance_duration_seconds_sum${sel}[${range}])) / sum(increase(camunda_process_instance_duration_seconds_count${sel}[${range}]))`,
    `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}[${range}])))`,
  ]
}

describe("analytics_engine_compare PromQL", () => {
  it("partitions every query by engine_id and applies the shared window", async () => {
    const handlers = captureHandlers(registerEngineCompareTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_compare")!(client, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 14,
      minBucketSize: 10,
    })

    expect(queries).toEqual([
      ...kpiQueries(
        '{engine_id="prod-a"}',
        '{state="COMPLETED",engine_id="prod-a"}',
        '{engine_id="prod-a"}',
        "14d",
      ),
      ...kpiQueries(
        '{engine_id="prod-b"}',
        '{state="COMPLETED",engine_id="prod-b"}',
        '{engine_id="prod-b"}',
        "14d",
      ),
    ])
  })

  it("scopes to processDefinitionKey everywhere and elementId only on the incident query", async () => {
    const handlers = captureHandlers(registerEngineCompareTools)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_compare")!(client, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 7,
      processDefinitionKey: "order",
      elementId: "Task_check",
      minBucketSize: 1,
    })

    const key = 'process_definition_key="order"'
    expect(queries).toHaveLength(12)
    expect(queries.every((q) => q.includes(key))).toBe(true)
    const elementScoped = queries.filter((q) => q.includes('activity_id="Task_check"'))
    expect(elementScoped).toEqual([
      `sum(increase(camunda_incident_created_total{${key},activity_id="Task_check",engine_id="prod-a"}[7d]))`,
      `sum(increase(camunda_incident_created_total{${key},activity_id="Task_check",engine_id="prod-b"}[7d]))`,
    ])
  })
})
