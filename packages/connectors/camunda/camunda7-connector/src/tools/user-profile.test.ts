import { describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { runWithMcpRequestInfo } from "@miragon-ai/widget-shell/server"
import { registerUserProfileTools } from "./user-profile.js"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_SHOW_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
} from "../tool-names.js"

type Handler = (
  params: unknown,
  ctx?: unknown,
) => Promise<{
  structuredContent?: Record<string, unknown>
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
}>

/** Register the triple against a mock server and expose what landed on it. */
function register(toolset?: string) {
  const tool = vi.fn()
  const server = { tool } as unknown as MCPServer
  const registry = { engines: [] } as unknown as EngineRegistry
  registerUserProfileTools(server, createInMemoryProfileStore(), registry, toolset)
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

const registeredToolNames = (toolset?: string): string[] => register(toolset).names

describe("registerUserProfileTools toolset filtering", () => {
  it("registers all three tools when no toolset is configured", () => {
    expect(registeredToolNames()).toEqual([
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

  it("fails open on unknown toolset names, like withToolsetFilter", () => {
    expect(registeredToolNames("nonsense")).toContain(CAMUNDA7_SAVE_USER_PROFILE)
  })
})

/**
 * The panel's Save button is driven by `canSave`, not by probing the tool list,
 * so the two must agree: a view claiming `canSave: true` in a deployment that
 * never registered the save tool renders a button whose click resolves to an
 * unknown tool.
 */
describe("canSave mirrors the registered tool surface", () => {
  const feedCanSave = async (toolset?: string) => {
    const { names, handlerFor } = register(toolset)
    const result = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({})
    return {
      canSave: result.structuredContent?.canSave,
      hasSaveTool: names.includes(CAMUNDA7_SAVE_USER_PROFILE),
    }
  }

  it.each([undefined, "read-only", "operations", "admin", "nonsense"])(
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

describe("anonymous round-trip", () => {
  it("reads a keyless save back on the next load (shared anonymous record)", async () => {
    const { handlerFor } = register()

    // No request context in tests → resolveProfileKey() is undefined → both
    // paths must land on the SAME shared anonymous record.
    await handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" })
    const result = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({})
    const profile = result.structuredContent?.profile as { language: string } | undefined
    expect(profile?.language).toBe("de")
  })
})

/**
 * HTTP without OAuth: mcp-use 2 issues no MCP session ids, so a request-scoped
 * ambient info WITHOUT identity is the norm there. The view must go read-only
 * (no Save button whose click errors) and the save tool must refuse with a
 * cause the operator can act on; an authenticated user restores the full
 * round-trip.
 */
describe("identity gating (mcp-use 2: no session ids)", () => {
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
