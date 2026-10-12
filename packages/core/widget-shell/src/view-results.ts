import {
  buildComposedView as buildComposedViewCore,
  buildSingleWidgetView as buildSingleWidgetViewCore,
  type ComposedViewInput,
  type SingleWidgetViewInput,
} from "@miragon/mcp-toolkit-core"

/**
 * The tool results every module returns, in one module of their own so the
 * shell's own tools (`shell-settings.ts`) use them without importing the
 * `/server` barrel that re-exports them.
 */

/**
 * mcp-use's raw `server.tool()` callback expects a result with an implicit
 * string index signature, which TypeScript synthesizes for anonymous object
 * types but NOT for the toolkit's named `ViewToolResult` interface. Re-annotate
 * the builders' return as that anonymous shape (the runtime value is the
 * toolkit's, unchanged) so the eager `*_show_*` handlers stay assignable.
 */
type ViewResult = {
  content: { type: "text"; text: string }[]
  structuredContent: Record<string, unknown>
}

export const buildSingleWidgetView = (input: SingleWidgetViewInput): ViewResult =>
  buildSingleWidgetViewCore(input)

export const buildComposedView = (input: ComposedViewInput): ViewResult =>
  buildComposedViewCore(input)

/** An app-only feed's result: the payload once, as compact JSON text. */
type FeedResult = { content: { type: "text"; text: string }[] }

/**
 * Plain (no-UI) tool result for an app-only `*_data` feed: the JSON payload
 * ONCE, as compact text, deliberately free of widget `_meta` keys — a
 * widget-tool result (`ui.resourceUri`) would be rendered by the host instead
 * of being returned to the in-widget `callTool()` (architecture invariant 5).
 * Text, not `structuredContent`: the widgets read either (the toolkit's
 * `parseToolResult` falls back to the JSON text), a host that strips
 * `structuredContent` keeps text, and sending both doubled every feed.
 * The single shared implementation for every module's data feeds.
 */
export const buildDataFeedResult = (data: Record<string, unknown>): FeedResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
})
