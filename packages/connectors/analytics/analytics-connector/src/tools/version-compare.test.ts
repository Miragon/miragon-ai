import { beforeEach, describe, expect, it } from "vitest"
import type { PrometheusClient, VersionCompareResult } from "@miragon-ai/analytics-client"
import type { RegisteredToolMeta, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { createEngineScope } from "../engine-ids.js"
import { registerVersionCompareTools } from "./version-compare.js"

type Config = ToolConfig<PrometheusClient>

/** Registrar stand-in that captures the tool's full config instead of an MCPServer. */
function captureConfig(): Config {
  const configs: Config[] = []
  const register = Object.assign((config: Config) => configs.push(config), {
    getRegisteredTools: (): RegisteredToolMeta[] => [],
  })
  registerVersionCompareTools(register as never, createEngineScope(["prod-a"]))
  expect(configs.map((c) => c.name)).toEqual(["analytics_version_compare"])
  return configs[0]
}

/** PrometheusClient that records every instant PromQL string and answers 20 per query. */
function recordingClient(): { client: PrometheusClient; queries: string[] } {
  const queries: string[] = []
  return {
    client: {
      instant: (query: string) => {
        queries.push(query)
        return Promise.resolve([{ metric: {}, value: 20 }])
      },
    },
    queries,
  }
}

const args = { processDefinitionKey: "order", versionA: 1, versionB: 2, windowDays: 14 }

describe("analytics_version_compare", () => {
  // Captured per test (not at collection time), so a registration that
  // registers nothing fails a test instead of the file's collection.
  let config: Config
  beforeEach(() => {
    config = captureConfig()
  })

  it("reports the incident family as null with a note — never as 0 (#327)", async () => {
    const { client, queries } = recordingClient()
    const res = (await config.handler(client, { ...args })) as VersionCompareResult

    // The incident counter has no version label: no query may filter it on one.
    expect(queries.some((q) => q.includes("incident"))).toBe(false)
    for (const kpi of res.kpis) {
      expect(kpi).toMatchObject({
        instance_count: 20,
        incident_count: null,
        incident_rate_pct: null,
        element_incident_count: null,
        element_incident_rate_pct: null,
      })
    }
    expect(res.delta.incident_rate_delta_pp).toBeNull()
    expect(res.delta.element_incident_rate_delta_pp).toBeNull()
    expect(res.notes.join(" ")).toContain("NOT zero")
  })

  it("tells the model the incident KPIs are null, not zero, and where to look instead", () => {
    expect(config.description).toContain("NOT zero")
    expect(config.description).toContain("no version label")
    expect(config.description).toContain("analytics_analyze_process_performance")
  })

  it("accepts the version-compare input plus the optional minBucketSize override", () => {
    expect(Object.keys(config.inputSchema ?? {})).toEqual(
      expect.arrayContaining(["processDefinitionKey", "versionA", "versionB", "minBucketSize"]),
    )
  })

  it("registers as a read-only external read under the analytics category", () => {
    expect(config.category).toBe("analytics")
    expect(config.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it("prefers an explicit minBucketSize over the resolved setting", async () => {
    const { client } = recordingClient()
    const explicit = (await config.handler(client, {
      ...args,
      minBucketSize: 3,
    })) as VersionCompareResult
    const fallback = (await config.handler(client, { ...args })) as VersionCompareResult
    expect(explicit.minBucketSize).toBe(3)
    // Without a store the registrar path lands on the schema default.
    expect(fallback.minBucketSize).toBe(10)
  })
})
