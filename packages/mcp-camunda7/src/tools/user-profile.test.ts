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

function registeredToolNames(toolset?: string): string[] {
  const tool = vi.fn()
  const server = { tool } as unknown as MCPServer
  const registry = { engines: [] } as unknown as EngineRegistry
  registerUserProfileTools(server, createInMemoryProfileStore(), registry, RESOURCE_URI, toolset)
  return tool.mock.calls.map((c) => (c[0] as { name: string }).name)
}

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

describe("anonymous round-trip", () => {
  it("reads a keyless save back on the next load (shared anonymous record)", async () => {
    const tool = vi.fn()
    const server = { tool } as unknown as MCPServer
    const registry = { engines: [] } as unknown as EngineRegistry
    registerUserProfileTools(server, createInMemoryProfileStore(), registry, RESOURCE_URI)

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

    // No request context in tests → resolveProfileKey() is undefined → both
    // paths must land on the SAME shared anonymous record.
    await handlerFor(CAMUNDA7_SAVE_USER_PROFILE)({ language: "de" })
    const result = await handlerFor(CAMUNDA7_USER_PROFILE_DATA)({})
    const profile = result.structuredContent?.profile as { language: string } | undefined
    expect(profile?.language).toBe("de")
  })
})
