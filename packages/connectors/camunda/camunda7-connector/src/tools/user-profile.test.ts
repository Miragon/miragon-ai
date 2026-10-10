import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import { registerUserProfileTools } from "./user-profile.js"
import { createInMemoryProfileStore, type ProfileStore } from "@miragon-ai/widget-shell/server"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { CAMUNDA7_TOOLSETS, resolveCamunda7Toolset, type Camunda7Toolset } from "../lib/toolsets.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_SHOW_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
} from "../tool-names.js"

afterEach(() => {
  vi.restoreAllMocks()
})

/** A signed-in caller's handler ctx (mcp-use's flattened `ctx.auth`). */
const CTX = { auth: { user: { id: "user-1" } } }

type Handler = (
  params: unknown,
  ctx?: unknown,
) => Promise<{
  structuredContent?: Record<string, unknown>
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
}>

/**
 * Register the triple against a mock server and expose what landed on it. The
 * toolset is always explicit; the default is `operations`, an authenticated
 * boot's no-suffix toolset (profile writes allowed).
 */
function register(
  toolset: Camunda7Toolset = "operations",
  registry = { engines: [] } as unknown as EngineRegistry,
  store: ProfileStore = createInMemoryProfileStore(),
) {
  const tool = vi.fn()
  const server = { tool } as unknown as MCPServer
  registerUserProfileTools(server, store, registry, toolset)
  const names = tool.mock.calls.map((c) => (c[0] as { name: string }).name)
  const definitionFor = (name: string): Record<string, unknown> => {
    const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
    if (!call) throw new Error(`tool ${name} not registered`)
    return call[0] as Record<string, unknown>
  }
  const handlerFor = (name: string): Handler => {
    const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
    if (!call) throw new Error(`tool ${name} not registered`)
    return call[1] as Handler
  }
  return { names, definitionFor, handlerFor }
}

const registeredToolNames = (toolset: Camunda7Toolset): string[] => register(toolset).names

describe("registerUserProfileTools toolset filtering", () => {
  it("registers all three tools under operations", () => {
    expect(registeredToolNames("operations")).toEqual([
      CAMUNDA7_SHOW_USER_PROFILE,
      CAMUNDA7_USER_PROFILE_DATA,
      CAMUNDA7_SAVE_USER_PROFILE,
    ])
  })

  it("keeps the durable save tool out of a read-only deployment", () => {
    const names = registeredToolNames("read-only")
    expect(names).toContain(CAMUNDA7_SHOW_USER_PROFILE)
    expect(names).toContain(CAMUNDA7_USER_PROFILE_DATA)
    expect(names).not.toContain(CAMUNDA7_SAVE_USER_PROFILE)
  })

  it("keeps save in operations and admin", () => {
    expect(registeredToolNames("operations")).toContain(CAMUNDA7_SAVE_USER_PROFILE)
    expect(registeredToolNames("admin")).toContain(CAMUNDA7_SAVE_USER_PROFILE)
  })

  it("fails closed for unknown and missing names, resolved like the plugin does", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(registeredToolNames(resolveCamunda7Toolset("nonsense"))).not.toContain(
      CAMUNDA7_SAVE_USER_PROFILE,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "nonsense"'))
    expect(registeredToolNames(resolveCamunda7Toolset(undefined))).not.toContain(
      CAMUNDA7_SAVE_USER_PROFILE,
    )
  })
})

/**
 * The panel's Save button is driven by `canSave`, not by probing the tool list,
 * so the two must agree: a view claiming `canSave: true` in a deployment that
 * never registered the save tool renders a button whose click resolves to an
 * unknown tool.
 */
describe("canSave mirrors the registered tool surface", () => {
  const feedCanSave = async (toolset: Camunda7Toolset) => {
    const { names, handlerFor } = register(toolset)
    const result = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}, CTX)
    return {
      canSave: result.structuredContent?.canSave,
      hasSaveTool: names.includes(CAMUNDA7_SAVE_USER_PROFILE),
    }
  }

  it.each(CAMUNDA7_TOOLSETS)(
    "agrees with the save tool's presence (toolset: %s)",
    async (toolset) => {
      const { canSave, hasSaveTool } = await feedCanSave(toolset)
      expect(canSave).toBe(hasSaveTool)
    },
  )

  it("reports false in a read-only deployment", async () => {
    expect((await feedCanSave("read-only")).canSave).toBe(false)
  })
})

describe("render-path contract (mcp-use 2 native fields)", () => {
  it("binds the show tool to a view named after the tool + the Apps-SDK _meta half", () => {
    const def = register().definitionFor(CAMUNDA7_SHOW_USER_PROFILE)
    expect(def.view).toMatchObject({ name: CAMUNDA7_SHOW_USER_PROFILE })
    // mcp-use refuses a view binding without an outputSchema.
    expect(def.outputSchema).toBeDefined()
    expect(def._meta).toMatchObject({
      "openai/outputTemplate": `ui://views/${CAMUNDA7_SHOW_USER_PROFILE}.html`,
      "openai/widgetAccessible": true,
    })
  })

  it("marks the data feed app-only (visibility) + widget-accessible, without a view", () => {
    const def = register().definitionFor(CAMUNDA7_USER_PROFILE_DATA)
    expect(def.visibility).toBe("app")
    expect(def.view).toBeUndefined()
    expect(def._meta).toMatchObject({ "openai/widgetAccessible": true })
    // No output template — a feed result must never be rendered by the host.
    expect((def._meta as Record<string, unknown>)["openai/outputTemplate"]).toBeUndefined()
  })

  it("keeps the save tool a plain model-visible tool (no view, no visibility)", () => {
    const def = register().definitionFor(CAMUNDA7_SAVE_USER_PROFILE)
    expect(def.view).toBeUndefined()
    expect(def.visibility).toBeUndefined()
    expect(def._meta).toBeUndefined()
  })
})

describe("engine disclosure (#324)", () => {
  it("offers engines by id and environment — never the internal engine REST baseUrl", async () => {
    const registry = {
      engines: [
        { id: "prod-a", baseUrl: "http://engine-a.internal:8410/engine-rest" },
        { id: "prod-b", baseUrl: "http://engine-b.internal:8410/engine-rest", environment: "eu" },
      ],
    } as unknown as EngineRegistry
    const result = await register("operations", registry).handlerFor(CAMUNDA7_USER_PROFILE_DATA)({})
    expect(result.structuredContent?.availableEngines).toEqual([
      { id: "prod-a", environment: "default" },
      { id: "prod-b", environment: "eu" },
    ])
    expect(JSON.stringify(result)).not.toContain(".internal")
  })
})

describe("caller round-trip", () => {
  it("reads the caller's save back on the next load — and only the caller's", async () => {
    const { handlerFor } = register()

    // The save and the read resolve the SAME record from the handler ctx.
    await handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" }, CTX)
    const result = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}, CTX)
    const profile = result.structuredContent?.profile as { language: string } | undefined
    expect(profile?.language).toBe("de")

    const other = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)(
      {},
      { auth: { user: { id: "u-2" } } },
    )
    // Another caller sees the default: follow the host's language.
    expect((other.structuredContent?.profile as { language: string }).language).toBe("system")
  })

  it("an explicitly declared local caller round-trips through the anonymous record", async () => {
    const store = createInMemoryProfileStore()
    const { handlerFor } = register("operations", undefined, store)
    const local = <T>(fn: () => T): T => runWithMcpRequestInfo({ anonymousCaller: true }, fn)
    await local(() => handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" }))
    const result = await local(() => handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}))
    expect(result.structuredContent?.canSave).toBe(true)
    expect((await store.get("anonymous"))?.language).toBe("de")
  })

  it("stores following the host's language, and summarizes it in English (#339)", async () => {
    const { handlerFor } = register()
    await handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" }, CTX)
    await handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "system" }, CTX)

    const result = await handlerFor(CAMUNDA7_SHOW_USER_PROFILE)({}, CTX)
    expect(JSON.stringify(result.structuredContent)).toContain('"language":"system"')
    // The host locale `system` follows never reaches the server: English summary.
    expect(result.content?.[0]?.text).toContain("User profile: language system")
  })
})

/**
 * The settings page sends "" for the "(auto)" default engine and the "(none)"
 * default dashboard. That must CLEAR the stored value: a stale default keeps
 * routing every engine-less tool call (writes included) to the old engine.
 */
describe("clearing an optional id from the settings page", () => {
  it('"" clears the saved default engine and default dashboard, other fields stay', async () => {
    const store = createInMemoryProfileStore()
    const { handlerFor } = register("operations", undefined, store)
    const save = (params: unknown) => handlerFor(CAMUNDA7_SAVE_USER_PROFILE)(params, CTX)
    await save({ defaultEngineId: "prod-a", defaultDashboardId: "d1", pinnedDashboardIds: ["d1"] })

    const cleared = await save({ defaultEngineId: "", defaultDashboardId: "" })
    expect(cleared.structuredContent?.defaultEngineId).toBeUndefined()
    expect(cleared.structuredContent?.defaultDashboardId).toBeUndefined()
    expect(cleared.structuredContent?.pinnedDashboardIds).toEqual(["d1"])

    const view = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}, CTX)
    const profile = view.structuredContent?.profile as Record<string, unknown>
    expect(profile.defaultEngineId).toBeUndefined()
    expect(profile.defaultDashboardId).toBeUndefined()
    expect((await store.get("user-1"))?.modules?.camunda7).toEqual({
      pinnedDashboardIds: ["d1"],
    })
  })
})

/**
 * HTTP without OAuth: a request-scoped ambient info WITHOUT identity is the
 * norm there. The view must go read-only (no Save button whose click errors)
 * and the save tool must refuse with a cause the operator can act on; an
 * authenticated user restores the full round-trip.
 */
describe("identity gating (OAuth is the only identity)", () => {
  it("reports canSave false to the view when the request carries no identity", async () => {
    const { handlerFor } = register()
    const result = await runWithMcpRequestInfo({}, () => handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}))
    expect(result.structuredContent?.canSave).toBe(false)
  })

  it("save refuses without identity, pointing at MCP_OAUTH", async () => {
    const { handlerFor } = register()
    const result = await runWithMcpRequestInfo({}, () =>
      handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" }),
    )
    expect(result.isError).toBe(true)
    expect(result.content?.[0]?.text).toContain("MCP_OAUTH")
  })

  it("an authenticated user gets canSave true and a working round-trip", async () => {
    const { handlerFor } = register()
    const under = <T>(fn: () => T): T => runWithMcpRequestInfo({ authUserId: "user-7" }, fn)
    await under(() => handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" }))
    const result = await under(() => handlerFor(CAMUNDA7_USER_PROFILE_DATA)({}))
    expect(result.structuredContent?.canSave).toBe(true)
    const profile = result.structuredContent?.profile as { language: string } | undefined
    expect(profile?.language).toBe("de")
  })
})
