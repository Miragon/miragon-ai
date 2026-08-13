import { z } from "zod"
import { appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import { listIncidentsInput, listProcessInstancesInput } from "@miragon-ai/camunda7-client/schemas"
import type { EngineHealthThresholds } from "../data/health-data.js"
import { clusterDetailFilterShape, pagingShape } from "../feed-contracts.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import type { ProfileStore } from "../lib/profile-store.js"

/**
 * Filters shared by `camunda7_show_incidents_dashboard` and its
 * `camunda7_incidents_data` feed, composed from the exported client schemas
 * (like the registrar tools) so the describe() texts stay in one place.
 */
export const incidentsDashboardFilterShape = {
  processDefinitionKey: listProcessInstancesInput.shape.processDefinitionKey,
  incidentType: listIncidentsInput.shape.incidentType,
}

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

/** One-line truncation for summaries (incident messages can be stacktrace-sized). */
export function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * The ONE definition view (mirrors the cockpit's "process-detail" route in
 * `widgets/cockpit-app/views.ts`): both show tools render this same composed
 * layout — the entry point only decides the FOCUS, threaded through the layout
 * cells as widget props (flow initial mode + no-incidents rendering).
 */
export function definitionViewLayout(focus?: "incidents") {
  return [
    { row: [{ widget: "camunda7:process-detail-header" }] },
    { row: [{ widget: "camunda7:process-definition-kpi" }] },
    {
      row: [
        {
          widget: "camunda7:process-definition-flow",
          props: { initialMode: focus === "incidents" ? "incidents" : "frequency" },
        },
      ],
    },
    {
      row: [
        {
          widget: "camunda7:activity-incident-list",
          props: { emptyVariant: focus === "incidents" ? "siblings" : "note" },
        },
      ],
    },
  ]
}

// Shared by the cluster-detail show tool + its data feed.
export const clusterDetailShape = { ...clusterDetailFilterShape, ...pagingShape }

/**
 * What the registration blocks share from the `registerWidgetTools` closure —
 * built once by the entry (`../widget-tools.ts`) and handed to each registrar.
 */
export interface WidgetToolsContext {
  server: MCPServer
  registry: EngineRegistry
  healthThresholds: EngineHealthThresholds
  profileStore: ProfileStore
}
