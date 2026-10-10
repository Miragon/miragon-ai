import { vi } from "vitest"
import type { MCPServer } from "mcp-use"
import type { ToolSurface } from "@miragon-ai/widget-shell/widgets"
import { createPlugin } from "../../plugin.js"
import type { Camunda7Toolset } from "../../lib/toolsets.js"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../../tool-names.js"
import { bindHandOff, camunda7Surface } from "./hand-off.js"

/**
 * The camunda7 tool surface a widget sees in a deployment on `toolset`: the
 * plugin's registration paths run against a mock server, and the surface is
 * what `camunda7_widget_actions_data` then reports — the same answer the
 * widgets filter their hand-offs by. Hand-off tests render against THIS, not
 * a hand-written tool list that could drift from the toolsets.
 */
export async function liveSurface(
  toolset: Camunda7Toolset,
  { analyticsActive = false }: { analyticsActive?: boolean } = {},
): Promise<ToolSurface & { tools: string[] }> {
  const tools = (await widgetActionsFeedFor(toolset)).modelTools
  return { ...camunda7Surface(tools, analyticsActive), tools }
}

/**
 * The `camunda7_widget_actions_data` answer of a deployment on `toolset` —
 * the fixture widget tests hand their host for that feed.
 */
export async function widgetActionsFeedFor(
  toolset: Camunda7Toolset,
): Promise<{ allowedActions: string[]; modelTools: string[] }> {
  const tool = vi.fn()
  const server = { tool, use: vi.fn(), prompt: vi.fn() } as unknown as MCPServer
  const plugin = createPlugin({
    engines: [{ id: "prod-a", baseUrl: "http://a.example/engine-rest" }],
    toolset,
  })
  plugin.registerTools?.(server)
  plugin.registerWidgetTools?.(server)
  const calls = tool.mock.calls as Array<[{ name: string }, (p: unknown) => Promise<unknown>]>
  const feed = calls.find(([definition]) => definition.name === CAMUNDA7_WIDGET_ACTIONS_DATA)
  const result = (await feed![1]({})) as {
    structuredContent: { allowedActions: string[]; modelTools: string[] }
  }
  return result.structuredContent
}

/** The hand-off builders bound to `toolset`'s live surface and `locale`. */
export async function handOffFor(
  toolset: Camunda7Toolset,
  options: { locale?: string; analyticsActive?: boolean } = {},
) {
  return bindHandOff(options.locale ?? "en", await liveSurface(toolset, options))
}
