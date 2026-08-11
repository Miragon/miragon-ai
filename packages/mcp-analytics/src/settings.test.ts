import { describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import {
  analyticsSettingsSaveInput,
  analyticsSettingsSchema,
  parseAnalyticsSettings,
  settingsFor,
} from "./settings.js"
import { registerSettingsTools } from "./settings-tools.js"
import { ANALYTICS_SAVE_SETTINGS, ANALYTICS_SETTINGS_DATA } from "./tool-names.js"
import { localizeFor, type ProfileSource } from "./server-locale.js"

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
    expect(await settingsFor(store)).toEqual({ defaultPeriod: "14d", minBucketSize: 3 })
  })

  it("falls back to defaults when the store throws (outage must not fail analytics reads)", async () => {
    const store: ProfileSource = {
      get: () => Promise.reject(new Error("connection refused")),
    }
    expect(await settingsFor(store)).toEqual({ defaultPeriod: "7d", minBucketSize: 10 })
  })
})

describe("localizeFor", () => {
  it("binds the translate to the profile language", async () => {
    const store: ProfileSource = { get: () => Promise.resolve({ language: "de" }) }
    const t = await localizeFor(store)
    expect(t("aSettings.heading")).toBe("Analyse-Einstellungen")
  })

  it("falls back to English on a store OUTAGE, like settingsFor", async () => {
    const store: ProfileSource = { get: () => Promise.reject(new Error("connection refused")) }
    const t = await localizeFor(store)
    expect(t("aSettings.heading")).toBe("Analytics Settings")
  })
})

describe("registerSettingsTools", () => {
  function registeredToolNames(store?: ProfileSource, toolset?: string): string[] {
    const tool = vi.fn()
    const server = { tool } as unknown as MCPServer
    registerSettingsTools(server, store, toolset)
    return tool.mock.calls.map((c) => (c[0] as { name: string }).name)
  }

  const writable: ProfileSource = {
    get: () => Promise.resolve(undefined),
    save: () => Promise.resolve({}),
  }

  it("registers the save tool only when the store is writable", () => {
    expect(registeredToolNames(writable)).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
      ANALYTICS_SAVE_SETTINGS,
    ])
  })

  it("stays read-only without a writable store (no save tool)", () => {
    const readOnly: ProfileSource = { get: () => Promise.resolve(undefined) }
    expect(registeredToolNames(readOnly)).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(registeredToolNames(undefined)).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
  })

  it('drops the durable save tool in the "read-only" toolset, fails open on unknown names', () => {
    expect(registeredToolNames(writable, "read-only")).toEqual([
      "analytics_show_settings",
      ANALYTICS_SETTINGS_DATA,
    ])
    expect(registeredToolNames(writable, "nonsense")).toContain(ANALYTICS_SAVE_SETTINGS)
  })

  it("round-trips a keyless save through the shared record", async () => {
    const records = new Map<string, { modules?: Record<string, unknown> }>()
    const store: ProfileSource = {
      get: (key) => Promise.resolve(records.get(key)),
      save: (key, input) => {
        const next = { ...(records.get(key) ?? {}), ...input }
        records.set(key, next)
        return Promise.resolve(next)
      },
    }
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, store)
    type Handler = (
      params: unknown,
      ctx?: unknown,
    ) => Promise<{
      structuredContent?: Record<string, unknown>
    }>
    const handlerFor = (name: string): Handler => {
      const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
      if (!call) throw new Error(`tool ${name} not registered`)
      return call[1] as Handler
    }

    await handlerFor(ANALYTICS_SAVE_SETTINGS)({ defaultPeriod: "30d" })
    // Only the provided field is persisted — no defaults materialized into
    // storage, so a later default change applies to fields never set.
    expect(records.get("anonymous")).toEqual({
      modules: { analytics: { defaultPeriod: "30d" } },
    })
    const data = await handlerFor(ANALYTICS_SETTINGS_DATA)({})
    expect(data.structuredContent?.settings).toEqual({ defaultPeriod: "30d", minBucketSize: 10 })
  })

  it("a partial save keeps the other saved value (merge over the raw slice)", async () => {
    const records = new Map<string, { modules?: Record<string, unknown> }>()
    const store: ProfileSource = {
      get: (key) => Promise.resolve(records.get(key)),
      save: (key, input) => {
        const next = { ...(records.get(key) ?? {}), ...input }
        records.set(key, next)
        return Promise.resolve(next)
      },
    }
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, store)
    const call = tool.mock.calls.find(
      (c) => (c[0] as { name: string }).name === ANALYTICS_SAVE_SETTINGS,
    )
    const save = call![1] as (params: unknown) => Promise<unknown>

    await save({ defaultPeriod: "30d" })
    await save({ minBucketSize: 5 })
    expect(records.get("anonymous")).toEqual({
      modules: { analytics: { defaultPeriod: "30d", minBucketSize: 5 } },
    })
  })

  // HTTP without OAuth: mcp-use 2 issues no MCP session ids, so the ambient
  // request info exists but carries no identity — the section must go
  // read-only and the save tool must refuse with an actionable cause.
  it("identity gating: canSave false + save refusal without identity, true with an auth user", async () => {
    const tool = vi.fn()
    registerSettingsTools({ tool } as unknown as MCPServer, {
      get: () => Promise.resolve(undefined),
      save: () => Promise.resolve({}),
    })
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
})
