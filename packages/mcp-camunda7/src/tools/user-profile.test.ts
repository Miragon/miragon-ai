import { describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use/server"
import { registerUserProfileTools } from "./user-profile.js"
import { createInMemoryProfileStore } from "../lib/profile-store.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import {
  CAMUNDA7_SAVE_USER_PROFILE,
  CAMUNDA7_SHOW_USER_PROFILE,
  CAMUNDA7_USER_PROFILE_DATA,
} from "../tool-names.js"

const RESOURCE_URI = "ui://camunda7/widgets.html"

type Handler = (
  params: unknown,
  ctx?: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>

/** Register the triple against a mock server and expose what landed on it. */
function register(toolset?: string) {
  const tool = vi.fn()
  const server = { tool } as unknown as MCPServer
  const registry = { engines: [] } as unknown as EngineRegistry
  registerUserProfileTools(server, createInMemoryProfileStore(), registry, RESOURCE_URI, toolset)
  const names = tool.mock.calls.map((c) => (c[0] as { name: string }).name)
  const handlerFor = (name: string): Handler => {
    const call = tool.mock.calls.find((c) => (c[0] as { name: string }).name === name)
    if (!call) throw new Error(`tool ${name} not registered`)
    return call[1] as Handler
  }
  return { names, handlerFor }
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
