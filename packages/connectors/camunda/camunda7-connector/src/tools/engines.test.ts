import { describe, it, expect, vi } from "vitest"
import { z } from "zod"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import {
  ANONYMOUS_PROFILE_KEY,
  createInMemoryProfileStore,
  runWithMcpRequestInfo,
  type McpRequestInfo,
  type ProfileStore,
} from "@miragon-ai/widget-shell/server"
import type { Client } from "@miragon-ai/camunda7-client"
import { registerEngineTools } from "./engines.js"
import {
  createEngineRegistry,
  UnknownEngineError,
  type EngineRegistry,
} from "../lib/resolve-engine.js"
import { CAMUNDA7_MODULE_KEY } from "../lib/profile-schema.js"
import type { Camunda7Toolset } from "../lib/toolsets.js"
import { CAMUNDA7_ENGINE } from "../tool-names.js"

const ENGINES = [
  { id: "alpha", baseUrl: "http://alpha/engine-rest", cockpitUrl: "http://alpha/cockpit" },
  { id: "beta", baseUrl: "http://beta/engine-rest" },
]

interface EngineToolArgs {
  action: "list" | "select" | "current"
  engineId?: string
}
type Handler = (reg: EngineRegistry, args: EngineToolArgs) => Promise<Record<string, unknown>>

/**
 * Registers the real engine tool against a recording registrar and exposes its
 * handler directly — the registrar/toolset mechanics have their own tests
 * (`lib/toolsets.test.ts`); here we pin the handler contract: what `select`
 * persists, whom it refuses, and what `list`/`current` report. The toolset is
 * always explicit; the default is `operations`, an authenticated boot's
 * no-suffix toolset (profile writes allowed).
 */
function harness(
  toolset: Camunda7Toolset = "operations",
  store: ProfileStore = createInMemoryProfileStore(),
) {
  const registry = createEngineRegistry(ENGINES, (e) => ({ __engine: e.id }) as unknown as Client)
  let registered: ToolConfig<EngineRegistry> | undefined
  const recorder = Object.assign(
    (config: ToolConfig<EngineRegistry>) => {
      registered = config
    },
    { getRegisteredTools: () => [] },
  )
  registerEngineTools(recorder as never, store, toolset)
  if (!registered) throw new Error("camunda7_engine did not register")
  const config = registered
  const handler = (config as unknown as { handler: Handler }).handler
  const call = (args: EngineToolArgs) => handler(registry, args)
  return { store, call, config }
}

/**
 * The tool's SHAPE follows the toolset at registration: `read-only` must list
 * strictly `readOnlyHint` tools (no exemption), so there the engine tool
 * registers without its durable `select` action.
 */
describe("camunda7_engine registration variant per toolset", () => {
  const actionsOf = (config: ToolConfig<EngineRegistry>) =>
    (config.inputSchema as unknown as { action: z.ZodEnum }).action.options

  it("read-only: a genuine read-only tool offering only list/current", () => {
    const { config } = harness("read-only")
    expect(config.name).toBe(CAMUNDA7_ENGINE)
    expect(config.annotations).toEqual({ readOnlyHint: true, idempotentHint: true })
    expect(actionsOf(config)).toEqual(["list", "current"])
    expect(config.description).not.toContain('action="select"')
    expect(config.description).toContain("does not allow saving a default engine")
  })

  it.each(["operations", "admin"] as const)(
    "%s: idempotent, explicitly non-destructive, all three actions",
    (toolset) => {
      const { config } = harness(toolset)
      expect(config.annotations).toEqual({ idempotentHint: true, destructiveHint: false })
      expect(actionsOf(config)).toEqual(["list", "select", "current"])
      expect(config.description).toContain('action="select" (requires engineId)')
      expect(config.description).not.toContain("does not allow saving a default engine")
    },
  )

  /** The model-facing contract: what each variant tells the model it can do. */
  const LEAD =
    "Manage which CIB Seven / Camunda 7 engine operations tools talk to. " +
    'action="list" returns the engines available to this profile grouped by ENVIRONMENT ' +
    "(`environments` maps each environment to its engine ids; every engine entry names its `environment`) " +
    "plus the saved default engine (if any) — pick an environment first, then one of its engines; "

  it("operations/admin describe the durable select and how routing falls back", () => {
    expect(harness("operations").config.description).toBe(
      LEAD +
        'action="select" (requires engineId) saves that engine as the caller\'s default — ' +
        "all subsequent operations tool calls without a per-call `engine` override route to it " +
        "(a durable per-user setting, the same field the settings page edits); " +
        'action="current" reports the saved default engine (or null). ' +
        "With more than one engine configured, pass the per-call `engine` parameter or save a default first.",
    )
  })

  it("read-only describes list/current and points at the per-call override only", () => {
    expect(harness("read-only").config.description).toBe(
      LEAD +
        'action="current" reports the saved default engine (or null). ' +
        "This deployment's toolset does not allow saving a default engine — with more than one engine " +
        "configured, pass the per-call `engine` parameter.",
    )
  })

  it("keeps its category and parameter docs in every variant", () => {
    for (const toolset of ["read-only", "operations"] as const) {
      const { config } = harness(toolset)
      const shape = config.inputSchema as unknown as Record<string, z.ZodType>
      expect(config.category).toBe("engines")
      expect(shape.action.description).toBe("Engine-management action to perform.")
      expect(shape.engineId.description).toBe(
        'Engine id to select (required for action="select"), e.g. "prod-a".',
      )
    }
  })

  it("the read-only input schema rejects select before the handler runs", () => {
    const schema = z.object(harness("read-only").config.inputSchema)
    expect(schema.safeParse({ action: "select", engineId: "beta" }).success).toBe(false)
    expect(schema.safeParse({ action: "list" }).success).toBe(true)
    const writable = z.object(harness("operations").config.inputSchema)
    expect(writable.safeParse({ action: "select", engineId: "beta" }).success).toBe(true)
  })
})

/** Run `fn` under a fixed caller identity (an authenticated user by default). */
const under = <T>(info: McpRequestInfo, fn: () => Promise<T>): Promise<T> =>
  runWithMcpRequestInfo(info, fn)
const USER = { authUserId: "user-1" }

describe("camunda7_engine select (durable default)", () => {
  it("persists the default engine into the caller's profile slice and stamps the auth user", async () => {
    const { store, call } = harness()
    const result = await under(USER, () => call({ action: "select", engineId: "beta" }))
    expect(result).toEqual({ defaultEngineId: "beta" })

    const record = await store.get("user-1")
    expect(record?.modules?.[CAMUNDA7_MODULE_KEY]).toMatchObject({ defaultEngineId: "beta" })
    // The auth-user stamp marks the record user-bound (exempt from session TTL).
    expect(record?.userId).toBe("user-1")
  })

  it("merges over the raw stored slice — sibling settings survive a select", async () => {
    const { store, call } = harness()
    await store.save("user-1", {
      modules: {
        [CAMUNDA7_MODULE_KEY]: { pinnedDashboardIds: ["d1"], futureField: "kept" },
      },
    })
    await under(USER, () => call({ action: "select", engineId: "alpha" }))
    expect((await store.get("user-1"))?.modules?.[CAMUNDA7_MODULE_KEY]).toMatchObject({
      defaultEngineId: "alpha",
      pinnedDashboardIds: ["d1"],
      futureField: "kept",
    })
  })

  it("persists under the shared anonymous record for context-free transports (stdio)", async () => {
    const { store, call } = harness()
    // No ambient request info at all = stdio/tests → the deliberate shared key.
    await call({ action: "select", engineId: "beta" })
    expect((await store.get(ANONYMOUS_PROFILE_KEY))?.modules?.[CAMUNDA7_MODULE_KEY]).toMatchObject({
      defaultEngineId: "beta",
    })
  })

  it("refuses without a caller identity, pointing at the per-call override", async () => {
    const { store, call } = harness()
    // HTTP request without auth or session id: identity resolves to no key.
    await expect(under({}, () => call({ action: "select", engineId: "beta" }))).rejects.toThrow(
      /No caller identity to save a default engine under.*per-call `engine` parameter/,
    )
    expect(await store.get(ANONYMOUS_PROFILE_KEY)).toBeUndefined()
  })

  it("refuses under a read-only toolset (durable write), pointing at the per-call override", async () => {
    const { store, call } = harness("read-only")
    await expect(under(USER, () => call({ action: "select", engineId: "beta" }))).rejects.toThrow(
      /toolset does not allow saving a default engine.*per-call `engine` parameter/,
    )
    expect(await store.get("user-1")).toBeUndefined()
  })

  it("still saves under the operations toolset (writes allowed)", async () => {
    const { store, call } = harness("operations")
    await under(USER, () => call({ action: "select", engineId: "beta" }))
    expect((await store.get("user-1"))?.modules?.[CAMUNDA7_MODULE_KEY]).toMatchObject({
      defaultEngineId: "beta",
    })
  })

  it("rejects an unknown engine id with the module's error contract", async () => {
    const { call } = harness()
    await expect(under(USER, () => call({ action: "select", engineId: "gamma" }))).rejects.toThrow(
      UnknownEngineError,
    )
  })

  it("rejects an engine outside the profile's allowedEngineIds curation", async () => {
    const { store, call } = harness()
    await store.save("user-1", {
      modules: { [CAMUNDA7_MODULE_KEY]: { allowedEngineIds: ["alpha"] } },
    })
    await expect(under(USER, () => call({ action: "select", engineId: "beta" }))).rejects.toThrow(
      /not available for this profile/,
    )
  })

  it("requires an engineId", async () => {
    const { call } = harness()
    await expect(under(USER, () => call({ action: "select" }))).rejects.toThrow(
      /requires an engineId/,
    )
  })
})

describe("camunda7_engine during a profile-store outage", () => {
  /** A preferences database that is down: the driver error names its host:port. */
  const down = (): ProfileStore => {
    const fail = () =>
      Promise.reject(
        Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" }),
      )
    return { get: fail, save: fail, delete: fail, cleanupSessions: fail }
  }

  it("list/current still answer — every engine, no saved default — and leak no host:port", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { call } = harness("operations", down())
    const list = await under(USER, () => call({ action: "list" }))
    expect((list.engines as Array<{ id: string }>).map((e) => e.id)).toEqual(["alpha", "beta"])
    expect(list.defaultEngineId).toBeNull()
    expect(await under(USER, () => call({ action: "current" }))).toEqual({
      defaultEngineId: null,
    })
    expect(JSON.stringify(list)).not.toMatch(/10\.1\.2\.3|5432/)
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/10\.1\.2\.3|5432/)
    warn.mockRestore()
  })

  it("select (a durable write) still fails visibly", async () => {
    const { call } = harness("operations", down())
    await expect(under(USER, () => call({ action: "select", engineId: "beta" }))).rejects.toThrow()
  })
})

describe("camunda7_engine list / current", () => {
  it("reports null when no default is saved", async () => {
    const { call } = harness()
    const list = await under(USER, () => call({ action: "list" }))
    expect(list.defaultEngineId).toBeNull()
    expect(await under(USER, () => call({ action: "current" }))).toEqual({
      defaultEngineId: null,
    })
  })

  it("reports the saved default consistently across list and current", async () => {
    const { call } = harness()
    await under(USER, () => call({ action: "select", engineId: "beta" }))
    const list = await under(USER, () => call({ action: "list" }))
    expect(list.defaultEngineId).toBe("beta")
    expect(await under(USER, () => call({ action: "current" }))).toEqual({
      defaultEngineId: "beta",
    })
  })

  it("nulls a stale default that no longer names a configured engine", async () => {
    const { store, call } = harness()
    await store.save("user-1", {
      modules: { [CAMUNDA7_MODULE_KEY]: { defaultEngineId: "gone" } },
    })
    expect((await under(USER, () => call({ action: "current" }))).defaultEngineId).toBeNull()
  })

  it("nulls a default excluded by the allowedEngineIds curation and filters the list", async () => {
    const { store, call } = harness()
    await store.save("user-1", {
      modules: {
        [CAMUNDA7_MODULE_KEY]: { defaultEngineId: "beta", allowedEngineIds: ["alpha"] },
      },
    })
    const list = await under(USER, () => call({ action: "list" }))
    expect((list.engines as Array<{ id: string }>).map((e) => e.id)).toEqual(["alpha"])
    expect(list.defaultEngineId).toBeNull()
  })

  it("falls back to all engines when the allow-list matches nothing (stale curation)", async () => {
    const { store, call } = harness()
    await store.save("user-1", {
      modules: { [CAMUNDA7_MODULE_KEY]: { allowedEngineIds: ["gone"] } },
    })
    const list = await under(USER, () => call({ action: "list" }))
    expect((list.engines as Array<{ id: string }>).map((e) => e.id)).toEqual(["alpha", "beta"])
  })

  it("never hands the model an engine's internal REST baseUrl — only a configured cockpitUrl", async () => {
    const { call } = harness()
    const list = await under(USER, () => call({ action: "list" }))
    expect(list.engines).toEqual([
      expect.objectContaining({ id: "alpha", cockpitUrl: "http://alpha/cockpit" }),
      expect.objectContaining({ id: "beta" }),
    ])
    for (const engine of list.engines as Array<Record<string, unknown>>) {
      expect(engine).not.toHaveProperty("baseUrl")
    }
    expect(JSON.stringify(list)).not.toContain("engine-rest")
  })

  it("groups an environment-less config into the single default environment", async () => {
    const { call } = harness()
    const list = await under(USER, () => call({ action: "list" }))
    expect((list.engines as Array<{ environment: string }>).map((e) => e.environment)).toEqual([
      "default",
      "default",
    ])
    expect(list.environments).toEqual([{ id: "default", engineIds: ["alpha", "beta"] }])
  })

  it("maps environments to their engines in config order — the two-stage selection view", async () => {
    const store = createInMemoryProfileStore()
    const registry = createEngineRegistry(
      [
        { id: "eu-a", baseUrl: "http://eu-a/engine-rest", environment: "prod-eu" },
        { id: "us-a", baseUrl: "http://us-a/engine-rest", environment: "prod-us" },
        { id: "eu-b", baseUrl: "http://eu-b/engine-rest", environment: "prod-eu" },
      ],
      (e) => ({ __engine: e.id }) as unknown as Client,
    )
    let handler: Handler | undefined
    const recorder = Object.assign(
      (config: ToolConfig<EngineRegistry>) => {
        handler = (config as unknown as { handler: Handler }).handler
      },
      { getRegisteredTools: () => [] },
    )
    registerEngineTools(recorder as never, store, "read-only")
    const list = await under(USER, () => handler!(registry, { action: "list" }))
    expect(
      (list.engines as Array<{ id: string; environment: string }>).map((e) => [
        e.id,
        e.environment,
      ]),
    ).toEqual([
      ["eu-a", "prod-eu"],
      ["us-a", "prod-us"],
      ["eu-b", "prod-eu"],
    ])
    expect(list.environments).toEqual([
      { id: "prod-eu", engineIds: ["eu-a", "eu-b"] },
      { id: "prod-us", engineIds: ["us-a"] },
    ])
  })
})
