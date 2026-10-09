import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { createInMemoryProfileStore, runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import {
  analyticsSettingsSaveInput,
  analyticsSettingsSchema,
  parseAnalyticsSettings,
  settingsFor,
} from "./settings.js"
import { registerSettingsTools } from "./settings-tools.js"
import { ANALYTICS_SAVE_SETTINGS, ANALYTICS_SETTINGS_DATA } from "./tool-names.js"
import { localizeFor, type ProfileSource } from "./server-locale.js"
import type { AnalyticsToolset } from "./toolsets.js"

afterEach(() => {
  vi.restoreAllMocks()
})

/** A signed-in caller's handler ctx (mcp-use's flattened `ctx.auth`). */
const CTX = { auth: { user: { id: "user-1" } } }

describe("analyticsSettingsSchema", () => {
  it("fills every default from an empty object", () => {
    expect(analyticsSettingsSchema.parse({})).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })
})

describe("analyticsSettingsSaveInput", () => {
  // Zod 4 re-applies `.default()`s through `.partial()` — the save input must
  // stay default-free so a single-field save can't reset the other saved value
  // at the tool boundary.
  it("keeps omitted fields ABSENT instead of materializing defaults", () => {
    expect(analyticsSettingsSaveInput.parse({ minBucketSize: 5 })).toEqual({ minBucketSize: 5 })
    expect(analyticsSettingsSaveInput.parse({})).toEqual({})
  })
})

describe("parseAnalyticsSettings", () => {
  it("returns defaults when the slice is absent", () => {
    expect(parseAnalyticsSettings(undefined)).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
    expect(parseAnalyticsSettings({})).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })

  it("returns defaults for a garbage slice (fail-soft)", () => {
    expect(parseAnalyticsSettings({ analytics: "nope" })).toEqual({
      defaultPeriod: "7d",
      minBucketSize: 10,
    })
    expect(parseAnalyticsSettings({ analytics: { defaultPeriod: "yesterday" } })).toEqual({
      defaultPeriod: "7d",
      minBucketSize: 10,
    })
  })

  it("degrades per FIELD: one invalid value keeps the other saved preference", () => {
    expect(
      parseAnalyticsSettings({ analytics: { defaultPeriod: "yesterday", minBucketSize: 5 } }),
    ).toEqual({ defaultPeriod: "7d", minBucketSize: 5 })
  })

  it("parses a valid slice and fills missing fields with defaults", () => {
    expect(parseAnalyticsSettings({ analytics: { defaultPeriod: "30d" } })).toEqual({
      defaultPeriod: "30d",
      minBucketSize: 10,
    })
  })

  it("ignores other modules' slices", () => {
    expect(parseAnalyticsSettings({ other: { defaultPeriod: "1d" } })).toEqual({
      defaultPeriod: "7d",
      minBucketSize: 10,
    })
  })
})

describe("settingsFor", () => {
  it("returns defaults without a store", async () => {
    expect(await settingsFor(undefined)).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })

  it("reads the slice off the profile record", async () => {
    const store: ProfileSource = {
      get: () =>
        Promise.resolve({ modules: { analytics: { defaultPeriod: "14d", minBucketSize: 3 } } }),
    }
    expect(await settingsFor(store, CTX)).toEqual({ defaultPeriod: "14d", minBucketSize: 3 })
    // No caller identity → the defaults, never someone else's slice.
    expect(await settingsFor(store)).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })

  it("falls back to defaults when the store throws (outage must not fail analytics reads)", async () => {
    const store: ProfileSource = {
      get: () => Promise.reject(new Error("connection refused")),
    }
    expect(await settingsFor(store, CTX)).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })
})

describe("localizeFor", () => {
  it("binds the translate to the profile language", async () => {
    const store: ProfileSource = { get: () => Promise.resolve({ language: "de" }) }
    const t = await localizeFor(store, CTX)
    expect(t("aSettings.heading")).toBe("Analyse-Einstellungen")
  })

  it("falls back to English on a store OUTAGE, like settingsFor", async () => {
    const store: ProfileSource = { get: () => Promise.reject(new Error("connection refused")) }
    const t = await localizeFor(store, CTX)
    expect(t("aSettings.heading")).toBe("Analytics Settings")
  })
})

describe("registerSettingsTools", () => {
  // `toolset` is a plain string here on purpose: an untyped (JS) caller can
  // hand the gate any name, and the gate must still resolve it fail-closed.
  function registeredToolNames(store?: ProfileSource, toolset?: string): string[] {
    const tool = vi.fn()
    const server = { tool } as unknown as MCPServer
    registerSettingsTools(server, store, toolset as AnalyticsToolset | undefined)
    return tool.mock.calls.map((c) => (c[0] as { name: string }).name)
  }

  const writable: ProfileSource = {
    get: () => Promise.resolve(undefined),
    save: () => Promise.resolve({}),
  }

  it('registers the save tool with a writable store in the "standard" toolset', () => {
    expect(registeredToolNames(writable, "standard")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
      ANALYTICS_SAVE_SETTINGS,
    ])
  })

  it("stays read-only without a writable store (no save tool), even in standard", () => {
    const readOnly: ProfileSource = { get: () => Promise.resolve(undefined) }
    expect(registeredToolNames(readOnly, "standard")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(registeredToolNames(undefined, "standard")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
  })

  it("fails closed WITHOUT a toolset: a writable store alone registers no save tool", () => {
    // A missing toolset is the read-only floor (silently — it is the
    // documented default of a direct caller, not a misconfiguration).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(registeredToolNames(writable)).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('drops the durable save tool in the "read-only" toolset, fails closed on unknown names', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(registeredToolNames(writable, "read-only")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(registeredToolNames(writable, "nonsense")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "nonsense"'))
  })

  it("a save-less section reports canSave false even for an identified caller", async () => {
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, writable, "read-only")
    const data = tool.mock.calls.find(
      (c) => (c[0] as { name: string }).name === ANALYTICS_SETTINGS_DATA,
    )![1] as () => Promise<{ structuredContent?: Record<string, unknown> }>
    const view = await runWithMcpRequestInfo({ authUserId: "user-7" }, () => data())
    expect(view.structuredContent?.canSave).toBe(false)
  })

  it("the model summary points at the save tool only when it is registered", async () => {
    type ShowResult = {
      content: Array<{ text: string }>
      structuredContent: Record<string, unknown>
    }
    const show = async (toolset: AnalyticsToolset): Promise<ShowResult> => {
      const tool = vi.fn()
      registerSettingsTools({ tool } as unknown as MCPServer, writable, toolset)
      const handler = tool.mock.calls.find(
        (c) => (c[0] as { name: string }).name === "analytics_show_settings",
      )![1] as () => Promise<ShowResult>
      return runWithMcpRequestInfo({ authUserId: "user-7" }, () => handler())
    }
    const defaults = { defaultPeriod: "7d", minBucketSize: 10 }

    const standard = await show("standard")
    expect(standard.content[0].text).toBe(
      "Analytics settings: default period 7d, min bucket size 10. Change via analytics_save_settings.",
    )
    expect(standard.structuredContent).toMatchObject({
      title: "Analytics Settings",
      layout: [{ row: [{ widget: "analytics:settings" }] }],
      context: {
        stepData: {
          result: {
            data: { settings: defaults, canSave: true },
            _app: "analytics",
            _dataType: "analytics:settings",
          },
        },
      },
    })

    // On the read-only floor the save tool does not exist — advertising it to
    // the model would send it to an unknown tool.
    const readOnly = await show("read-only")
    expect(readOnly.content[0].text).toBe(
      "Analytics settings: default period 7d, min bucket size 10.",
    )
    expect(readOnly.structuredContent).toMatchObject({
      context: { stepData: { result: { data: { settings: defaults, canSave: false } } } },
    })
  })

  it("declares honest metadata for the settings triple", () => {
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, writable, "standard")
    const definitions = tool.mock.calls.map(
      (c) =>
        c[0] as {
          name: string
          title?: string
          description?: string
          annotations?: Record<string, boolean>
        },
    )
    const readOnlyRead = { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
    expect(definitions.map(({ name, annotations }) => [name, annotations])).toEqual([
      ["analytics_show_settings", readOnlyRead],
      [ANALYTICS_SETTINGS_DATA, readOnlyRead],
      [
        ANALYTICS_SAVE_SETTINGS,
        { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      ],
    ])
    for (const { name, title, description } of definitions) {
      expect(title, `${name} title`).toBeTruthy()
      expect(description, `${name} description`).toBeTruthy()
    }
  })

  it("round-trips a save through the caller's record", async () => {
    const store = createInMemoryProfileStore()
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, store, "standard")
    type Handler = (
      params: unknown,
      ctx?: unknown,
    ) => Promise<{
      structuredContent?: Record<string, unknown>
      content?: Array<{ type?: string; text?: string }>
    }>
    const handlerFor = (name: string): Handler => {
      const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
      if (!call) throw new Error(`tool ${name} not registered`)
      return call[1] as Handler
    }

    const saved = await handlerFor(ANALYTICS_SAVE_SETTINGS)({ defaultPeriod: "30d" }, CTX)
    // The widget reads the EFFECTIVE slice back from structuredContent; the
    // model gets the localized confirmation.
    expect(saved.structuredContent).toEqual({ defaultPeriod: "30d", minBucketSize: 10 })
    expect(saved.content).toEqual([
      {
        type: "text",
        text: "Analytics settings saved: default period 30d, min bucket size 10.",
      },
    ])
    // Only the provided field is persisted — no defaults materialized into
    // storage, so a later default change applies to fields never set.
    expect((await store.get("user-1"))?.modules).toEqual({
      analytics: { defaultPeriod: "30d" },
    })
    const data = await handlerFor(ANALYTICS_SETTINGS_DATA)({}, CTX)
    expect(data.structuredContent?.settings).toEqual({ defaultPeriod: "30d", minBucketSize: 10 })
  })

  it("a partial save keeps the other saved value (the store merges the patch)", async () => {
    const store = createInMemoryProfileStore()
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, store, "standard")
    const call = tool.mock.calls.find(
      (c) => (c[0] as { name: string }).name === ANALYTICS_SAVE_SETTINGS,
    )
    const save = call![1] as (
      params: unknown,
      ctx: unknown,
    ) => Promise<{ structuredContent?: unknown }>

    await save({ defaultPeriod: "30d" }, CTX)
    const saved = await save({ minBucketSize: 5 }, CTX)
    expect((await store.get("user-1"))?.modules).toEqual({
      analytics: { defaultPeriod: "30d", minBucketSize: 5 },
    })
    // The report is the SAVED slice, not just this call's patch.
    expect(saved.structuredContent).toEqual({ defaultPeriod: "30d", minBucketSize: 5 })
  })

  it("concurrent saves of the two fields keep both, even when one already held a value", async () => {
    // Writes land after a round-trip, like a database's: the second save runs
    // while the first one's write is still in flight. A save that handed the
    // store a slice pre-read outside its lock would write the stale period back.
    const inner = createInMemoryProfileStore()
    await inner.save("user-1", { modules: { analytics: { defaultPeriod: "7d" } } })
    const store: ProfileSource = {
      get: (key) => inner.get(key),
      save: async (key, input, opts) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return inner.save(key, input, opts)
      },
    }
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, store, "standard")
    const save = tool.mock.calls.find(
      (c) => (c[0] as { name: string }).name === ANALYTICS_SAVE_SETTINGS,
    )![1] as (params: unknown, ctx: unknown) => Promise<unknown>

    const first = save({ defaultPeriod: "30d" }, CTX)
    await new Promise((resolve) => setTimeout(resolve, 1))
    await Promise.all([first, save({ minBucketSize: 25 }, CTX)])
    expect((await inner.get("user-1"))?.modules).toEqual({
      analytics: { defaultPeriod: "30d", minBucketSize: 25 },
    })
  })

  // HTTP without OAuth: the ambient request info exists but carries no
  // identity — the section must go read-only and the save tool must refuse
  // with an actionable cause.
  it("identity gating: canSave false + save refusal without identity, true with an auth user", async () => {
    const tool = vi.fn()
    registerSettingsTools(
      { tool } as unknown as MCPServer,
      { get: () => Promise.resolve(undefined), save: () => Promise.resolve({}) },
      "standard",
    )
    type Handler = (
      params: unknown,
      ctx?: unknown,
    ) => Promise<{
      structuredContent?: Record<string, unknown>
      content?: Array<{ text?: string }>
      isError?: boolean
    }>
    const handlerFor = (name: string): Handler => {
      const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
      if (!call) throw new Error(`tool ${name} not registered`)
      return call[1] as Handler
    }

    const bare = await runWithMcpRequestInfo({}, () => handlerFor(ANALYTICS_SETTINGS_DATA)({}))
    expect(bare.structuredContent?.canSave).toBe(false)
    const refused = await runWithMcpRequestInfo({}, () =>
      handlerFor(ANALYTICS_SAVE_SETTINGS)({ defaultPeriod: "30d" }),
    )
    expect(refused.isError).toBe(true)
    expect(refused.content?.[0]?.text).toContain("MCP_OAUTH")

    const authed = await runWithMcpRequestInfo({ authUserId: "user-7" }, () =>
      handlerFor(ANALYTICS_SETTINGS_DATA)({}),
    )
    expect(authed.structuredContent?.canSave).toBe(true)
  })

  it("stamps the OAuth caller on the saved record as its owner", async () => {
    const save = vi.fn<NonNullable<ProfileSource["save"]>>(() => Promise.resolve({}))
    const tool = vi.fn()
    registerSettingsTools(
      { tool } as unknown as MCPServer,
      { get: () => Promise.resolve(undefined), save },
      "standard",
    )
    const handler = tool.mock.calls.find(
      (c) => (c[0] as { name: string }).name === ANALYTICS_SAVE_SETTINGS,
    )![1] as (params: unknown) => Promise<unknown>

    await runWithMcpRequestInfo({ authUserId: "user-7" }, () => handler({ minBucketSize: 5 }))
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0][1]).toEqual({ modules: { analytics: { minBucketSize: 5 } } })
    expect(save.mock.calls[0][2]).toEqual({ userId: "user-7" })
  })
})
