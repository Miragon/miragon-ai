import { describe, expect, it } from "vitest"
import type { MCPServer } from "mcp-use"
import type { PipelineContext } from "@miragon/mcp-toolkit-core"
import { runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import type { PrometheusClient, PromSample } from "@miragon-ai/analytics-client"
import { createEngineScope } from "../engine-ids.js"
import { analyticsModule } from "../module.js"
import type { ProfileSource } from "../server-locale.js"
import type { AnalyticsAppConfig } from "./app-config.js"
import { loadDashboardStep, loadFailureDashboardStep } from "./index.js"

/**
 * The analytics pipeline steps run under render-view / the dashboard builder,
 * whose step keys are free-form (`z.record(z.string(), z.unknown())`) — no
 * schema checks them before the step does. So the steps hold the line the
 * tools' strict inputs hold: a malformed key is refused naming the key, never
 * read as "omitted" (which for `analytics:engine` would silently widen one
 * engine's view to the whole fleet).
 */

function recordingClient() {
  const sent: string[] = []
  const ch: PrometheusClient = {
    instant: (q) => {
      sent.push(q)
      return Promise.resolve<PromSample[]>([])
    },
  }
  return { ch, sent }
}

/** A profile store holding one signed-in user's saved analytics period. */
const profileStore: ProfileSource = {
  get: (key) =>
    Promise.resolve(
      key === "user-7" ? { modules: { analytics: { defaultPeriod: "30d" } } } : undefined,
    ),
}

function setup(withProfileStore = false) {
  const { ch, sent } = recordingClient()
  const appConfig: AnalyticsAppConfig = {
    client: ch,
    engineScope: createEngineScope(["prod-a", "prod-b"]),
    ...(withProfileStore ? { profileStore } : {}),
  }
  return { appConfig, sent }
}

const context = (keys: Record<string, unknown>): PipelineContext => ({
  steps: {},
  keys,
  errors: [],
})

const STEPS = [
  ["analytics:load-dashboard", loadDashboardStep],
  ["analytics:load-failure-dashboard", loadFailureDashboardStep],
] as const

/** Every engine id the `engine_id` matchers of `promql` admit. */
const enginesRead = (sent: string[]) =>
  new Set(
    sent.flatMap((q) =>
      [...q.matchAll(/engine_id(=~?)"([^"]*)"/g)].flatMap((m) =>
        m[1] === "=~" ? m[2].split("|") : [m[2]],
      ),
    ),
  )

describe.each(STEPS)("%s — analytics:engine", (_id, step) => {
  it("reads the whole configured fleet when the key is omitted", async () => {
    const { appConfig, sent } = setup()
    const out = await step.execute(context({}), appConfig)

    expect((out.data as { engines: string[] }).engines).toEqual(["prod-a", "prod-b"])
    expect([...enginesRead(sent)].sort()).toEqual(["prod-a", "prod-b"])
  })

  it("reads exactly the configured engine(s) the key names", async () => {
    const { appConfig, sent } = setup()
    const out = await step.execute(context({ "analytics:engine": "prod-b" }), appConfig)

    expect((out.data as { engines: string[] }).engines).toEqual(["prod-b"])
    expect([...enginesRead(sent)]).toEqual(["prod-b"])
  })

  it("refuses an engine this server is not configured for, before any query", async () => {
    const { appConfig, sent } = setup()
    await expect(
      step.execute(context({ "analytics:engine": "tenant-x" }), appConfig),
    ).rejects.toThrow('Unknown engine "tenant-x"')
    expect(sent).toEqual([])
  })

  it.each([
    ["a number", 7],
    ["a list with a non-string id", ["prod-a", 7]],
    ["null", null],
    ["an object", { id: "prod-a" }],
  ])("refuses %s instead of widening to the fleet", async (_label, raw) => {
    const { appConfig, sent } = setup()
    await expect(step.execute(context({ "analytics:engine": raw }), appConfig)).rejects.toThrow(
      /analytics:engine must be an engine id or a list of engine ids/,
    )
    expect(sent).toEqual([])
  })
})

describe("the plugin wires the steps' caller lookup", () => {
  it("hands the steps the profile store and installs the ambient request info they read", () => {
    const patterns: string[] = []
    const server = {
      tool: () => {},
      use: (pattern: string) => {
        patterns.push(pattern)
      },
    } as unknown as MCPServer
    const plugin = analyticsModule.createPlugin(
      { url: "http://prometheus.invalid" },
      { profileStore, engineIds: ["prod-a"] },
    )
    plugin.registerTools?.(server)

    expect((plugin.appConfig as unknown as AnalyticsAppConfig).profileStore).toBe(profileStore)
    // A step gets no handler ctx: without this middleware its caller lookup
    // finds no identity and every saved period silently reads as the default.
    expect(patterns).toEqual(["mcp:*"])
  })
})

describe("analytics:load-dashboard — analytics:period", () => {
  const windows = (sent: string[]) =>
    new Set(sent.flatMap((q) => [...q.matchAll(/\[(\w+)\]/g)].map((m) => m[1])))

  it("takes the caller's SAVED period when the key is omitted (N83/N116)", async () => {
    const { appConfig, sent } = setup(true)
    const out = await runWithMcpRequestInfo({ authUserId: "user-7" }, () =>
      loadDashboardStep.execute(context({}), appConfig),
    )

    expect((out.data as { period: string }).period).toBe("30d")
    expect([...windows(sent)]).toEqual(["30d"])
  })

  it("falls back to the module default without a caller or a saved period", async () => {
    const { appConfig } = setup(true)
    const anonymous = await runWithMcpRequestInfo({}, () =>
      loadDashboardStep.execute(context({}), appConfig),
    )
    const storeless = await loadDashboardStep.execute(context({}), setup().appConfig)

    expect((anonymous.data as { period: string }).period).toBe("7d")
    expect((storeless.data as { period: string }).period).toBe("7d")
  })

  it("lets an explicit period win over the saved one", async () => {
    const { appConfig } = setup(true)
    const out = await runWithMcpRequestInfo({ authUserId: "user-7" }, () =>
      loadDashboardStep.execute(context({ "analytics:period": "1d" }), appConfig),
    )
    expect((out.data as { period: string }).period).toBe("1d")
  })

  it.each([
    ["an unknown period", "90d"],
    ["a number", 7],
    ["null", null],
  ])("refuses %s instead of substituting a default", async (_label, raw) => {
    const { appConfig, sent } = setup()
    await expect(
      loadDashboardStep.execute(context({ "analytics:period": raw }), appConfig),
    ).rejects.toThrow(/analytics:period must be one of 1d, 3d, 7d, 14d, 30d/)
    expect(sent).toEqual([])
  })

  it("refuses a non-string process key, naming the key", async () => {
    const { appConfig, sent } = setup()
    await expect(
      loadDashboardStep.execute(context({ "analytics:processDefinitionKey": 7 }), appConfig),
    ).rejects.toThrow(/analytics:processDefinitionKey must be a process definition key/)
    expect(sent).toEqual([])
  })
})
