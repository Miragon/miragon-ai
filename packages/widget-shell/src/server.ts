/**
 * Server-side surface of the widget shell (`@miragon-ai/widget-shell/server`):
 * the eager view builders for `*_show_*` tools plus the shared error wrapper for
 * raw `server.tool()` registrations. Both were extracted into the toolkit core
 * in 0.4.0; this barrel keeps the stable `/server` import path so the
 * camunda7/analytics widget tools don't have to churn their imports.
 */
import {
  buildComposedView as buildComposedViewCore,
  buildSingleWidgetView as buildSingleWidgetViewCore,
  type ComposedViewInput,
  type SingleWidgetViewInput,
} from "@miragon/mcp-toolkit-core"

export type {
  ComposedViewEntry,
  ComposedViewInput,
  SingleWidgetViewInput,
} from "@miragon/mcp-toolkit-core"
export { withToolErrors } from "@miragon/mcp-toolkit-core/tools"

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
