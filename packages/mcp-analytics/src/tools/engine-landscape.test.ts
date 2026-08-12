import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { PrometheusClient, PromSample } from "@miragon-ai/client-analytics"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerEngineLandscapeTools } from "./engine-landscape.js"

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

/** Records every PromQL string and answers with a two-engine landscape. */
function recordingClient(): { client: PrometheusClient; queries: string[] } {
  const queries: string[] = []
  const cell = (engine_id: string, process_definition_key: string, value: number): PromSample => ({
    metric: { engine_id, process_definition_key },
    value,
  })
  return {
    client: {
      instant: (query: string) => {
        queries.push(query)
        if (query.includes("process_definitions_deployed")) {
          return Promise.resolve([cell("prod-a", "order", 1), cell("prod-b", "onboarding", 1)])
        }
        if (query.includes("process_instances_running")) {
          return Promise.resolve([cell("prod-a", "order", 5)])
        }
        return Promise.resolve([])
      },
    },
    queries,
  }
}

describe("analytics_engine_landscape", () => {
  it("builds the inventory matrix and issues one flat query per metric", async () => {
    const handlers = captureHandlers(registerEngineLandscapeTools)
    const { client, queries } = recordingClient()

    const result = (await handlers.get("analytics_engine_landscape")!(client, {})) as {
      engines: Array<{ engineId: string; runningInstances: number }>
      sharedProcessKeys: string[]
    }

    expect(result.engines.map((e) => e.engineId)).toEqual(["prod-a", "prod-b"])
    expect(result.engines[0].runningInstances).toBe(5)
    // Each engine runs its own definition — nothing to compare like-for-like.
    expect(result.sharedProcessKeys).toEqual([])
    expect(queries).toEqual([
      "sum by (engine_id, process_definition_key)(camunda_process_definitions_deployed)",
      "sum by (engine_id, process_definition_key)(camunda_process_instances_running)",
      "sum by (engine_id, process_definition_key)(camunda_incidents_open)",
      "sum by (engine_id, process_definition_key)(camunda_jobs_failed)",
      "sum by (engine_id)(camunda_jobs_executable)",
      "sum by (engine_id)(camunda_jobs_suspended)",
      "sum by (engine_id)(camunda_jobs_due_future)",
      "sum by (engine_id)(camunda_external_tasks_open)",
    ])
  })

  it("applies the engine filter and keeps a non-reporting engine visible", async () => {
    const handlers = captureHandlers(registerEngineLandscapeTools)
    const { client, queries } = recordingClient()

    const result = (await handlers.get("analytics_engine_landscape")!(client, {
      engine: ["prod-a", "prod-b", "prod-c"],
    })) as { engines: Array<{ engineId: string; reporting: boolean }> }

    expect(queries.every((q) => q.includes('{engine_id=~"prod-a|prod-b|prod-c"}'))).toBe(true)
    expect(result.engines.find((e) => e.engineId === "prod-c")).toMatchObject({ reporting: false })
  })
})

describe("analytics_engine_landscape registration", () => {
  const config = captureConfigs(registerEngineLandscapeTools).get("analytics_engine_landscape")!

  it("registers under the analytics category as a read-only external read", () => {
    expect(config.category).toBe("analytics")
    expect(config.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it("tells the model that counts — not per-engine rates — are the point", () => {
    // Without this the model would divide the counts back into per-engine
    // rates and compare them, which is exactly the confound the view exists
    // to avoid.
    expect(config.description).toContain("counts, not rates")
    expect(config.description).toContain("process mixes")
    expect(config.description).toContain("sharedProcessKeys")
  })

  it("accepts an engine list or nothing at all", () => {
    const schema = z.object(config.inputSchema)
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ engine: ["prod-a", "prod-b"] }).success).toBe(true)
    expect(schema.safeParse({ engine: "prod-a" }).success).toBe(true)
  })
})
