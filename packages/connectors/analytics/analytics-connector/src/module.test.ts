import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { composeModules } from "@miragon-ai/widget-shell/server"
import { analyticsModule } from "./module.js"
import { allowsDurableWrites, ANALYTICS_TOOLSETS, analyticsToolsets } from "./toolsets.js"
import {
  ANALYTICS_DASHBOARD_DATA,
  ANALYTICS_SAVE_SETTINGS,
  ANALYTICS_SETTINGS_DATA,
} from "./tool-names.js"
import type { ProfileSource } from "./server-locale.js"

afterEach(() => {
  vi.restoreAllMocks()
})

interface RecordedTool {
  name: string
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

const writableStore: ProfileSource = {
  get: () => Promise.resolve(undefined),
  save: () => Promise.resolve({}),
}

/**
 * Boots the module the way the composition root does — `createPlugin` with a
 * raw config — and records EVERY tool both registration hooks put on the
 * server: the registrar tools (`registerTools`, a raw `createToolRegistrar`
 * with no toolset filter), the `show_*` widget tools, the app-only `*_data`
 * feeds and the settings triple (`registerWidgetTools`). A writable store, so
 * the only thing deciding the settings save is the toolset.
 */
function surfaceFor(config: Record<string, unknown>): RecordedTool[] {
  const tools: RecordedTool[] = []
  const server = {
    tool: (definition: RecordedTool) => {
      tools.push(definition)
    },
    // installMcpRequestContext registers its middleware here.
    use: () => {},
  } as unknown as MCPServer
  const plugin = analyticsModule.createPlugin(
    { url: "http://prometheus.invalid", ...config },
    { profileStore: writableStore },
  )
  plugin.registerTools?.(server)
  plugin.registerWidgetTools?.(server)
  return tools
}

const namesOf = (tools: RecordedTool[]) => tools.map((tool) => tool.name).sort()

describe("analyticsModule toolset policy", () => {
  it("declares its vocabulary instead of the deprecated supportsToolsets pass-through", () => {
    expect(analyticsModule.toolsets).toBe(analyticsToolsets)
    expect(analyticsModule).not.toHaveProperty("supportsToolsets")
  })

  it("resolves the toolset in createPlugin: standard saves, a missing toolset is the floor", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(namesOf(surfaceFor({ toolset: "standard" }))).toContain(ANALYTICS_SAVE_SETTINGS)
    expect(namesOf(surfaceFor({ toolset: "read-only" }))).not.toContain(ANALYTICS_SAVE_SETTINGS)
    expect(namesOf(surfaceFor({}))).not.toContain(ANALYTICS_SAVE_SETTINGS)
    expect(warn).not.toHaveBeenCalled()
  })

  it("fails closed on an unknown toolset from a direct caller, with ONE warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(namesOf(surfaceFor({ toolset: "admin" }))).toEqual(
      namesOf(surfaceFor({ toolset: "read-only" })),
    )
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "admin"'))
  })

  describe("through the composition root (composeModules)", () => {
    const composition = composeModules({ label: "test", modules: [analyticsModule] })
    const bootConfig = (env: NodeJS.ProcessEnv, authenticated: boolean) =>
      composition.resolveBoot(env, { authenticated }).entries[0].config

    it("no suffix: read-only without OAuth, standard with it", () => {
      expect(bootConfig({}, false)).toMatchObject({ toolset: "read-only" })
      expect(bootConfig({}, true)).toMatchObject({ toolset: "standard" })
      expect(namesOf(surfaceFor(bootConfig({}, false)))).not.toContain(ANALYTICS_SAVE_SETTINGS)
      expect(namesOf(surfaceFor(bootConfig({}, true)))).toContain(ANALYTICS_SAVE_SETTINGS)
    })

    it("an explicit suffix wins; an empty one falls back to read-only even under OAuth", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      expect(bootConfig({ MCP_ACTIVE_MODULES: "analytics:standard" }, false)).toMatchObject({
        toolset: "standard",
      })
      expect(bootConfig({ MCP_ACTIVE_MODULES: "analytics:" }, true)).toMatchObject({
        toolset: "read-only",
      })
      expect(warn).toHaveBeenCalledOnce()
    })
  })
})

describe("analyticsModule env surface", () => {
  it("maps PROMETHEUS_URL, treating a blank value as unset", () => {
    expect(analyticsModule.configFromEnv({ PROMETHEUS_URL: " http://p:9090 " })).toEqual({
      url: "http://p:9090",
    })
    expect(analyticsModule.configFromEnv({ PROMETHEUS_URL: "  " })).toEqual({ url: undefined })
    expect(analyticsModule.knownEnvVars).toEqual(["PROMETHEUS_URL"])
  })

  it("warns at boot only while PROMETHEUS_URL is unset", () => {
    expect(analyticsModule.bootWarnings({})).toEqual([
      expect.stringContaining("PROMETHEUS_URL is not set"),
    ])
    expect(analyticsModule.bootWarnings({ PROMETHEUS_URL: "http://p:9090" })).toEqual([])
  })
})

/**
 * Structural guard. Analytics registrar tools are NEVER toolset-filtered
 * (`tools/index.ts` uses a raw `createToolRegistrar`, unlike camunda7's
 * `withToolsetFilter`), so "read-only lists only readOnlyHint tools" holds
 * only as long as every tool the module registers declares itself read-only.
 * This derives the expectation from each tool's OWN annotations — a future
 * tool that writes, or forgets `readOnlyHint`, fails here without anyone
 * updating a list.
 *
 * The one exemption is `analytics_save_settings`: a durable (but merge-only,
 * non-destructive) write of the caller's own settings slice, registered
 * outside the registrar and gated by `allowsDurableWrites` — so it can never
 * appear on the read-only floor.
 */
describe("the analytics toolset rule holds structurally for every registered tool", () => {
  const EXEMPT_DURABLE_WRITE = ANALYTICS_SAVE_SETTINGS

  it("records the whole surface: registrar tools, widget tools, *_data feeds, settings", () => {
    const names = namesOf(surfaceFor({ toolset: "standard" }))
    // Sanity: otherwise the guards below are vacuous.
    expect(names.length).toBeGreaterThanOrEqual(20)
    expect(names).toEqual(
      expect.arrayContaining([
        "analytics_analyze_process_performance",
        "analytics_show_dashboard",
        ANALYTICS_DASHBOARD_DATA,
        "analytics_show_settings",
        ANALYTICS_SETTINGS_DATA,
        EXEMPT_DURABLE_WRITE,
      ]),
    )
  })

  it.each([...ANALYTICS_TOOLSETS, undefined])(
    "toolset %s: every tool but the gated settings save declares readOnlyHint: true",
    (toolset) => {
      for (const tool of surfaceFor({ toolset })) {
        if (tool.name === EXEMPT_DURABLE_WRITE) continue
        expect(
          tool.annotations?.readOnlyHint,
          `${tool.name} is registered by the analytics module without readOnlyHint: true — ` +
            "analytics tools are not toolset-filtered, so it would leak into analytics:read-only",
        ).toBe(true)
      }
    },
  )

  it.each([...ANALYTICS_TOOLSETS, undefined])(
    "toolset %s: the exempt write is registered exactly when allowsDurableWrites says so",
    (toolset) => {
      const registered = namesOf(surfaceFor({ toolset })).includes(EXEMPT_DURABLE_WRITE)
      expect(registered).toBe(allowsDurableWrites(toolset))
    },
  )

  it("the read-only floor lists ONLY readOnlyHint tools — no exemption needed", () => {
    for (const tool of surfaceFor({ toolset: "read-only" })) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
    }
  })

  it("standard is the read-only surface plus exactly the settings save", () => {
    const readOnly = namesOf(surfaceFor({ toolset: "read-only" }))
    expect(namesOf(surfaceFor({ toolset: "standard" }))).toEqual(
      [...readOnly, EXEMPT_DURABLE_WRITE].sort(),
    )
  })

  it("the exempt write declares itself an idempotent, NON-destructive write", () => {
    const save = surfaceFor({ toolset: "standard" }).find(
      (tool) => tool.name === EXEMPT_DURABLE_WRITE,
    )
    expect(save?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    })
  })

  it("no analytics tool is destructive — the module has no admin tier to hold one", () => {
    const destructive = surfaceFor({ toolset: "standard" }).filter(
      (tool) => tool.annotations?.destructiveHint === true,
    )
    expect(destructive.map((tool) => tool.name)).toEqual([])
  })
})
