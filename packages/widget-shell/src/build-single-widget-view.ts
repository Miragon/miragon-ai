import type { LayoutConfig } from "@miragon/mcp-toolkit-core"

export interface SingleWidgetViewInput {
  widget: string
  app: string
  dataType: string
  data: unknown
  title?: string
}

export interface ComposedViewEntry {
  /** Stable id used as the step result key (must be unique within the view). */
  id?: string
  /** Step `_dataType` widgets resolve through `adaptDataWidget`. */
  dataType: string
  /** Eager data payload — same shape the matching widget expects. */
  data: unknown
}

export interface ComposedViewInput {
  app: string
  layout: LayoutConfig
  entries: ComposedViewEntry[]
  title?: string
}

/**
 * Multi-widget variant of {@link buildSingleWidgetView}. Lets `*_show_*` tools
 * compose several small widgets into a layout while keeping the eager
 * (no-pipeline) execution model: each widget resolves its slice through
 * `adaptDataWidget` by `_dataType`. Widgets that share a `dataType` all
 * receive the same data object and are expected to render their own slice.
 *
 * NOTE: when called with multiple `entries`, the text channel emits an object
 * keyed by step id, not a widget's flat data shape. `useToolMutation` /
 * `useToolQuery` callers that go through `parseToolResult` expect the latter,
 * so multi-entry composed views are not safe to refresh in-place from inside
 * a child widget. Refresh by re-invoking the parent tool via
 * `host.showWidget(...)` instead.
 */
export function buildComposedView(input: ComposedViewInput): {
  content: { type: "text"; text: string }[]
  structuredContent: Record<string, unknown>
} {
  const stepData: Record<string, unknown> = {}
  const stepIds: string[] = []
  for (const [idx, entry] of input.entries.entries()) {
    const id = entry.id ?? `result_${idx}`
    stepIds.push(id)
    stepData[id] = {
      data: entry.data,
      keys: {},
      _app: input.app,
      _dataType: entry.dataType,
    }
  }
  // Single-entry case: keep payload shape compatible with refresh callers
  // that read `data` directly out of the text channel.
  const text =
    input.entries.length === 1
      ? JSON.stringify(input.entries[0].data)
      : JSON.stringify(
          Object.fromEntries(input.entries.map((e, i) => [e.id ?? `result_${i}`, e.data])),
        )
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      title: input.title,
      context: {
        keys: {},
        stepIds,
        stepData,
        errors: [],
      },
      layout: input.layout,
    },
  }
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
  // Emit the widget's data as JSON in the text content so callers using
  // `useToolMutation` / `useToolQuery` (which run results through
  // `parseToolResult`) receive the data directly. The widget's initial render
  // still reads from `structuredContent` via `useWidget`, so this only
  // affects refreshes triggered from inside the widget (e.g. period switch).
  return {
    content: [{ type: "text" as const, text: JSON.stringify(input.data) }],
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
