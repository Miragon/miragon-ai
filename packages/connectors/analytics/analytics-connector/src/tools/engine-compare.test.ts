import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/analytics-client"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { createEngineScope } from "../engine-ids.js"
import { registerEngineCompareTools } from "./engine-compare.js"

const scope = createEngineScope(["prod-a", "prod-b"])
const register = (r: never, store?: never) => registerEngineCompareTools(r, scope, store)

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

/** The five KPI queries per engine — no duplicate incident query without an element (N85). */
function kpiQueries(sel: string, completedSel: string, range: string) {
  return [
    `sum(increase(camunda_process_instance_started_total${sel}[${range}]))`,
    `sum(increase(camunda_process_instance_ended_total${completedSel}[${range}]))`,
    `sum(increase(camunda_incident_created_total${sel}[${range}]))`,
    `sum(increase(camunda_process_instance_duration_seconds_sum${sel}[${range}])) / sum(increase(camunda_process_instance_duration_seconds_count${sel}[${range}]))`,
    `histogram_quantile(0.95, sum by (le)(increase(camunda_process_instance_duration_seconds_bucket${sel}[${range}])))`,
  ]
}

describe("analytics_engine_compare PromQL", () => {
  it("partitions every query by engine_id and applies the shared window", async () => {
    const handlers = captureHandlers(register)
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
        "14d",
      ),
      ...kpiQueries(
        `{${key},engine_id="prod-b"}`,
        `{${key},state="COMPLETED",engine_id="prod-b"}`,
        "14d",
      ),
    ])
  })

  it("scopes to processDefinitionKey everywhere and activityId only on the incident query", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    await handlers.get("analytics_engine_compare")!(client, {
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 7,
      processDefinitionKey: "order",
      activityId: "Task_check",
      minBucketSize: 1,
    })

    const key = 'process_definition_key="order"'
    // Five KPI queries per engine plus the element-scoped incident count.
    expect(queries).toHaveLength(12)
    expect(queries.every((q) => q.includes(key))).toBe(true)
    const elementScoped = queries.filter((q) => q.includes('activity_id="Task_check"'))
    expect(elementScoped).toEqual([
      `sum(increase(camunda_incident_created_total{${key},activity_id="Task_check",engine_id="prod-a"}[7d]))`,
      `sum(increase(camunda_incident_created_total{${key},activity_id="Task_check",engine_id="prod-b"}[7d]))`,
    ])
  })

  it("refuses an engine this server is not configured for, before any query (N138)", async () => {
    const handlers = captureHandlers(register)
    const { client, queries } = recordingClient()

    await expect(
      handlers.get("analytics_engine_compare")!(client, {
        processDefinitionKey: "order",
        engineA: "prod-a",
        engineB: "tenant-x",
        windowDays: 7,
      }),
    ).rejects.toThrow(/Unknown engine "tenant-x" in engineB/)
    expect(queries).toEqual([])
  })

  it("reads 'nothing ended' as an unmeasured duration and suppresses its delta (N78)", async () => {
    const handlers = captureHandlers(register)
    // Both engines started 40 instances; only prod-a has completed any — prod-b
    // has no duration sample at all.
    const client: PrometheusClient = {
      instant: (q) =>
        Promise.resolve(
          q.includes("duration_seconds") && q.includes("prod-b")
            ? []
            : [{ metric: {}, value: q.includes("duration_seconds") ? 30 : 40 }],
        ),
    }
    const result = (await handlers.get("analytics_engine_compare")!(client, {
      processDefinitionKey: "order",
      engineA: "prod-a",
      engineB: "prod-b",
      windowDays: 7,
      minBucketSize: 1,
    })) as {
      kpis: Array<{ avg_duration_sec: number | null; p95_duration_sec: number | null }>
      delta: { avg_duration_delta_pct: number | null; p95_duration_delta_pct: number | null }
    }

    expect(result.kpis[1]).toMatchObject({ avg_duration_sec: null, p95_duration_sec: null })
    // Never a −100 % from a missing value.
    expect(result.delta).toMatchObject({
      avg_duration_delta_pct: null,
      p95_duration_delta_pct: null,
    })
  })

  it("prefers an explicit minBucketSize over the resolved setting", async () => {
    const handlers = captureHandlers(register)
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
  const config = captureConfigs(register).get("analytics_engine_compare")!

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
