import { describe, it, expect } from "vitest"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import {
  ANONYMOUS_PROFILE_KEY,
  createInMemoryProfileStore,
  runWithMcpRequestInfo,
  type McpRequestInfo,
} from "@miragon-ai/widget-shell/server"
import type { Client } from "@miragon-ai/camunda7-client"
import { registerEngineTools } from "./engines.js"
import {
  createEngineRegistry,
  UnknownEngineError,
  type EngineRegistry,
} from "../lib/resolve-engine.js"
import { CAMUNDA7_MODULE_KEY } from "../lib/profile-schema.js"

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
 * persists, whom it refuses, and what `list`/`current` report.
 */
function harness(toolset?: string) {
  const store = createInMemoryProfileStore()
  const registry = createEngineRegistry(ENGINES, (e) => ({ __engine: e.id }) as unknown as Client)
  let handler: Handler | undefined
  const recorder = Object.assign(
    (config: ToolConfig<EngineRegistry>) => {
      handler = (config as unknown as { handler: Handler }).handler
    },
    { getRegisteredTools: () => [] },
  )
  registerEngineTools(recorder as never, store, toolset)
  if (!handler) throw new Error("camunda7_engine did not register")
  const call = (args: EngineToolArgs) => handler!(registry, args)
  return { store, call }
}

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
})
