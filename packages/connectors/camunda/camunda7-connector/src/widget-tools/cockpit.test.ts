import { describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import type { Client } from "@miragon-ai/camunda7-client"
import { createInMemoryProfileStore } from "@miragon-ai/widget-shell/server"
import { DEFAULT_HEALTH_THRESHOLDS } from "../data/health-data.js"
import { createEngineRegistry } from "../lib/resolve-engine.js"
import { CAMUNDA7_OPEN_COCKPIT } from "../tool-names.js"
import { engineParamShape } from "../lib/with-engine.js"
import { registerCockpitWidgetTools } from "./cockpit.js"

type Handler = (
  args: Record<string, unknown>,
  ctx?: unknown,
) => Promise<{
  structuredContent?: { context: { stepData: { result: { data: Record<string, unknown> } } } }
  content: Array<{ type: string; text: string }>
}>

/** Register the cockpit widget tools against a mock server and expose `camunda7_open_cockpit`. */
function openCockpit(engines: Parameters<typeof createEngineRegistry>[0]): Handler {
  const tool = vi.fn()
  registerCockpitWidgetTools({
    server: { tool } as unknown as MCPServer,
    registry: createEngineRegistry(engines, (e) => ({ __engine: e.id }) as unknown as Client),
    healthThresholds: DEFAULT_HEALTH_THRESHOLDS,
    profileStore: createInMemoryProfileStore(),
    toolset: "read-only",
    modelTools: () => [],
    engineParam: engineParamShape,
  })
  const call = tool.mock.calls.find(
    ([definition]) => (definition as { name: string }).name === CAMUNDA7_OPEN_COCKPIT,
  )
  expect(call).toBeDefined()
  return call![1] as Handler
}

describe("camunda7_open_cockpit — the cockpit bootstrap", () => {
  it("hands the app each engine's id and environment — never its internal REST baseUrl", async () => {
    const handler = openCockpit([
      { id: "alpha", baseUrl: "http://alpha.internal:8410/engine-rest", environment: "prod" },
      { id: "beta", baseUrl: "http://beta.internal:8410/engine-rest" },
    ])
    const result = await handler({})
    const data = result.structuredContent!.context.stepData.result.data
    expect(data).toEqual({
      engineId: null,
      engines: [
        { id: "alpha", environment: "prod" },
        { id: "beta", environment: "default" },
      ],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("engine-rest")
    expect(serialized).not.toContain(".internal")
  })

  it("lands on the only engine when exactly one is configured", async () => {
    const handler = openCockpit([{ id: "solo", baseUrl: "http://solo.internal/engine-rest" }])
    const data = (await handler({})).structuredContent!.context.stepData.result.data
    expect(data).toEqual({ engineId: "solo", engines: [{ id: "solo", environment: "default" }] })
  })
})
