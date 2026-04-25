import type { LayoutConfig } from "@miragon/mcp-toolkit-core"

export interface SingleWidgetViewInput {
  widget: string
  app: string
  dataType: string
  data: unknown
  title?: string
}

/**
 * Builds an MCP tool result that renders a single widget through the same
 * `McpAppView` shell as `render-view`. Use this from `*_show_*` tools that
 * compute their data eagerly (no pipeline) — the widget data is exposed under
 * `context.steps["result"]` with the given `_dataType`, so the registry
 * adapter (`adaptDataWidget`) can route it to the right widget component.
 */
export function buildSingleWidgetView(input: SingleWidgetViewInput): {
  content: { type: "text"; text: string }[]
  structuredContent: Record<string, unknown>
} {
  const layout: LayoutConfig = [{ row: [{ widget: input.widget }] }]
  return {
    content: [{ type: "text" as const, text: input.title ?? input.widget }],
    structuredContent: {
      title: input.title,
      context: {
        keys: {},
        stepIds: ["result"],
        stepData: {
          result: {
            data: input.data,
            keys: {},
            _app: input.app,
            _dataType: input.dataType,
          },
        },
        errors: [],
      },
      layout,
    },
  }
}
