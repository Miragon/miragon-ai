import { afterEach, describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { DEFAULT_HEALTH_THRESHOLDS } from "../data/health-data.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { CAMUNDA7_WIDGET_ACTIONS, CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import { registerWidgetActionsFeed } from "./actions.js"

afterEach(() => {
  vi.restoreAllMocks()
})

type Handler = (params: unknown) => Promise<{ structuredContent?: Record<string, unknown> }>

/** Register the feed against a mock server and expose its definition + handler. */
function registerFeed(toolset?: string) {
  const tool = vi.fn()
  registerWidgetActionsFeed({
    server: { tool } as unknown as MCPServer,
    registry: { engines: [] } as unknown as EngineRegistry,
    healthThresholds: DEFAULT_HEALTH_THRESHOLDS,
    profileStore: createInMemoryProfileStore(),
    toolset,
  })
  expect(tool).toHaveBeenCalledOnce()
  const [definition, handler] = tool.mock.calls[0] as [Record<string, unknown>, Handler]
  return { definition, handler }
}

async function allowedActionsFor(toolset?: string): Promise<unknown> {
  const result = await registerFeed(toolset).handler({})
  return result.structuredContent?.allowedActions
}

describe("camunda7_widget_actions_data", () => {
  it("is an app-only feed with no view binding", () => {
    const { definition } = registerFeed()
    expect(definition.name).toBe(CAMUNDA7_WIDGET_ACTIONS_DATA)
    expect(definition.visibility).toBe("app")
    expect(definition).not.toHaveProperty("view")
  })

  it("allows every widget action without a toolset", async () => {
    expect(await allowedActionsFor(undefined)).toEqual([...CAMUNDA7_WIDGET_ACTIONS])
  })

  it("allows none in read-only", async () => {
    expect(await allowedActionsFor("read-only")).toEqual([])
  })

  it("keeps the admin-only suspend/cancel out of operations", async () => {
    const allowed = await allowedActionsFor("operations")
    expect(allowed).toContain("camunda7_resolve_incident")
    expect(allowed).not.toContain("camunda7_set_process_instance_suspension")
    expect(allowed).not.toContain("camunda7_delete_process_instance")
  })
})
