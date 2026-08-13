import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerEngineCompareTools } from "./engine-compare.js"

type Config = ToolConfig<PrometheusClient>

/** Registrar stand-in that captures each tool's full config instead of an MCPServer. */
function captureConfigs(registerModule: (register: never) => void): Map<string, Config> {
  const configs = new Map<string, Config>()
  const register = Object.assign(
    (config: Config) => {
      configs.set(config.name, config)
    },
    { getRegisteredTools: (): RegisteredToolMeta[] => [] },
  )
  registerModule(register as never)
  return configs
}

function captureHandlers(registerModule: (register: never) => void) {
  const configs = captureConfigs(registerModule)
  return new Map([...configs].map(([name, c]) => [name, c.handler]))
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
    const key = 'process_definition_key="order"'

    await handlers.get("analytics_engine_compare")!(client, {
      processDefinitionKey: "order",
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 14,
      minBucketSize: 10,
    })

    expect(queries).toEqual([
      ...kpiQueries(
        `{${key},engine_id="prod-a"}`,
        `{${key},state="COMPLETED",engine_id="prod-a"}`,
        `{${key},engine_id="prod-a"}`,
        "14d",
      ),
      ...kpiQueries(
        `{${key},engine_id="prod-b"}`,
        `{${key},state="COMPLETED",engine_id="prod-b"}`,
        `{${key},engine_id="prod-b"}`,
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

  it("prefers an explicit minBucketSize over the resolved setting", async () => {
    const handlers = captureHandlers(registerEngineCompareTools)
    const { client } = recordingClient()

    const explicit = (await handlers.get("analytics_engine_compare")!(client, {
      processDefinitionKey: "order",
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 7,
      minBucketSize: 3,
    })) as { minBucketSize: number }
    const fallback = (await handlers.get("analytics_engine_compare")!(client, {
      processDefinitionKey: "order",
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 7,
    })) as { minBucketSize: number }

    // "explicit arg > saved setting > schema default": without a store or a
    // resolvable profile key the registrar path lands on the schema default.
    expect(explicit.minBucketSize).toBe(3)
    expect(fallback.minBucketSize).toBe(10)
  })
})

describe("analytics_engine_compare registration", () => {
  const config = captureConfigs(registerEngineCompareTools).get("analytics_engine_compare")!

  it("registers under the analytics category as a read-only external read", () => {
    expect(config.category).toBe("analytics")
    // toolsets.test.ts derives admin-only status from these; a read that lost
    // `readOnlyHint` would silently change the toolset surface.
    expect(config.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it("tells the model why the process scope is mandatory", () => {
    // The description is the only place a model learns that an unscoped
    // engine-vs-engine comparison measures the process mix — losing it turns
    // the tool back into the apples-to-oranges comparison it replaced.
    expect(config.description).toContain("processDefinitionKey is required")
    expect(config.description).toContain("process mixes")
    expect(config.description).toContain("analytics_engine_landscape")
  })

  it("requires processDefinitionKey at the schema boundary", () => {
    const parsed = z.object(config.inputSchema).safeParse({
      engineA: "prod-a",
      engineB: "prod-b",
    })
    expect(parsed.success).toBe(false)
  })
})
