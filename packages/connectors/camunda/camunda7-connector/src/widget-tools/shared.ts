import type { MCPServer } from "mcp-use"
import { listIncidentsInput, listProcessInstancesInput } from "@miragon-ai/camunda7-client/schemas"
import type { EngineHealthThresholds } from "../data/health-data.js"
import { clusterDetailFilterShape, pagingShape } from "../feed-contracts.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import type { ProfileStore } from "@miragon-ai/widget-shell/server"

/**
 * Filters shared by `camunda7_show_incidents_dashboard` and its
 * `camunda7_incidents_data` feed, composed from the exported client schemas
 * (like the registrar tools) so the describe() texts stay in one place.
 */
export const incidentsDashboardFilterShape = {
  processDefinitionKey: listProcessInstancesInput.shape.processDefinitionKey,
  incidentType: listIncidentsInput.shape.incidentType,
}

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
