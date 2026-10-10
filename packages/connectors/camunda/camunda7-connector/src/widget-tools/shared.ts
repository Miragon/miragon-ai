import type { MCPServer } from "mcp-use"
import type { EngineHealthThresholds } from "../data/health-data.js"
import { clusterDetailFilterShape, pagingShape } from "../feed-contracts.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import type { Camunda7Toolset } from "../lib/toolsets.js"
import type { EngineParamShape } from "../lib/with-engine.js"
import type { ProfileStore } from "@miragon-ai/widget-shell/server"

// showToolBinding / appOnly live in @miragon-ai/widget-shell/server — the one
// implementation of the invariant-5 wire-contract spreads for all modules.

/** One-line truncation for summaries (incident messages can be stacktrace-sized). */
export function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * The ONE definition view (mirrors the cockpit's "process-detail" route in
 * `widgets/cockpit-app/views.ts`): both show tools render this same composed
 * layout — the entry point only decides the FOCUS, threaded through the layout
 * cells as a widget prop (the list's no-incidents rendering). The flow always
 * leads with the incident overlay.
 */
export function definitionViewLayout(focus?: "incidents") {
  return [
    { row: [{ widget: "camunda7:process-detail-header" }] },
    { row: [{ widget: "camunda7:process-definition-kpi" }] },
    { row: [{ widget: "camunda7:process-definition-flow" }] },
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
  /** The deployment's resolved toolset (from the `MCP_ACTIVE_MODULES` suffix or the auth-dependent default). */
  toolset: Camunda7Toolset
  /** The module's model-visible tool names (recorded at registration; read lazily). */
  modelTools: () => string[]
  /** The `engine` parameter narrowed to the configured ids (`engineParamShapeFor`) — spread it into every input. */
  engineParam: EngineParamShape
}
