import { z } from "zod"
import { appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"

/**
 * The two spreads every module's raw `server.tool()` widget registrations
 * compose — the wire-contract halves of architecture invariant 5. One
 * implementation for all modules (they were byte-identical copies before):
 * a module that hand-rolls these drifts out of the widget-contract e2e test's
 * expectations on the first mcp-use change.
 */

/**
 * View binding + Apps-SDK `_meta` half for a widget-RENDERING (model-visible)
 * tool — spread into the `server.tool` definition of every `show_*` tool. The
 * view name IS the tool name: mcp-use derives the entire MCP Apps half of the
 * wire contract (`_meta.ui.resourceUri`, flat `ui/resourceUri`, resource CSP)
 * from the first-class `view` binding — never stamp `ui` keys by hand, mcp-use
 * overwrites that namespace on `tools/list`. What mcp-use does NOT derive is
 * the OpenAI Apps SDK half (`openai/*`): `appsSdkMeta` builds it, pointing
 * `openai/outputTemplate` at the same `ui://views/<name>.html` resource. The
 * `outputSchema` is required by mcp-use for any view-bound tool; `passthrough`
 * matches the free-form `structuredContent` the view builders return without
 * stripping keys on SDK-side validation.
 */
export function showToolBinding(name: string, title: string) {
  return {
    view: { name },
    outputSchema: z.object({}).passthrough(),
    _meta: appsSdkMeta({ resourceUri: viewResourceUri(name), title }),
  }
}

/**
 * App-only marker for the internal `*_data` feeds — spread into each feed's
 * `server.tool` definition. `visibility: "app"` is mcp-use 2's first-class
 * field (emitted as SEP-1865 `_meta.ui.visibility: ["app"]`): conforming hosts
 * hide these tools from the LLM tool surface while keeping them callable from
 * widgets via `callTool`; the "Internal JSON feed" descriptions stay as
 * fallback for non-conforming hosts. Deliberately no `view` binding — the
 * feeds must return JSON, not render UI.
 *
 * `openai/widgetAccessible` covers the Apps-SDK half of the dual contract:
 * those hosts only allow in-widget callTool on tools carrying the key — a
 * feed without it renders fine but every pagination/search/refresh is denied.
 * The key does NOT render anything (no outputTemplate), so the feeds stay
 * JSON-only. mcp-use passes non-`ui` `_meta` entries through untouched.
 */
export const appOnly = {
  visibility: "app" as const,
  _meta: { "openai/widgetAccessible": true },
}
