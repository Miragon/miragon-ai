import { z } from "zod"
import { appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"

/**
 * Shared spreads for this module's raw `server.tool()` widget registrations
 * (widget-tools.ts + settings-tools.ts) — module-local on purpose: modules are
 * peers, so the camunda7 twin of this helper is never imported.
 */

/**
 * Binding for a model-visible `*_show_*` tool: the mcp-use `view` (named after
 * the tool — mcp-use derives the MCP Apps `_meta.ui.*` keys from it), the
 * `outputSchema` a view binding requires (passthrough — the widget-shell view
 * builders return free-form `structuredContent`), and the Apps SDK `openai/*`
 * half of the `_meta` contract pointing at the same view resource.
 */
export function showToolBinding(name: string, title: string) {
  return {
    view: { name },
    outputSchema: z.object({}).passthrough(),
    _meta: appsSdkMeta({ resourceUri: viewResourceUri(name), title }),
  }
}

/**
 * Marker for the internal `*_data` feeds: mcp-use's native `visibility: "app"`
 * hides the tool from the model (SEP-1865), while the hand-stamped
 * `openai/widgetAccessible` lets Apps SDK hosts accept the in-widget
 * `callTool` — mirroring what the toolkit's own widget-tool registrar emits.
 */
export const appOnly = {
  visibility: "app" as const,
  _meta: { "openai/widgetAccessible": true },
}
