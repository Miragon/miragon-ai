import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildIncidentsDashboardData } from "../data/incidents-dashboard-data.js"
import { buildProcessIncidentsData } from "../data/process-incidents-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, requiredKey, stepEngine, stringKey } from "./shared.js"

/**
 * The open-incidents overview across process definitions — adapter over
 * {@link buildIncidentsDashboardData}, the builder of
 * `camunda7_show_incidents_dashboard`. Its scoping key has its own name, so a
 * view that also drills into one definition (`camunda7:processDefinitionKey`)
 * does not narrow the overview by accident. Consumed by
 * `camunda7:incident-overview-kpi` and `camunda7:incident-process-list`.
 */
export const loadIncidentsDashboardStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-incidents-dashboard",
  description:
    "Open incidents across process definitions: exact totals, one card per definition key (all versions) with an activity breakdown. Powers camunda7:incident-overview-kpi and camunda7:incident-process-list.",
  dataType: "camunda7:incidentsDashboard",
  requires: [],
  optionalKeys: [
    ENGINE_KEY,
    {
      key: "camunda7:incidentsProcessDefinitionKey",
      description: "Restrict the overview to this definition key.",
    },
    {
      key: "camunda7:incidentType",
      description: 'Restrict the overview to one incident type, e.g. "failedJob".',
    },
  ],
  produces: ["camunda7:incidentsDashboardData"],
  execute: async (context, appConfig) => {
    const { client, engineId, baseUrl, cockpitUrl, provider } = await stepEngine(context, appConfig)
    const data = {
      ...(await buildIncidentsDashboardData(client, {
        baseUrl,
        cockpitUrl,
        provider,
        processDefinitionKey: stringKey(context, "camunda7:incidentsProcessDefinitionKey"),
        incidentType: stringKey(context, "camunda7:incidentType"),
      })),
      engineId,
    }
    return {
      data,
      keys: { "camunda7:incidentsDashboardData": data },
      _app: "camunda7",
      _step: "load-incidents-dashboard",
    }
  },
}

/**
 * The unified definition view of one key (all versions) — adapter over
 * {@link buildProcessIncidentsData}, the builder of
 * `camunda7_show_process_detail` / `camunda7_show_process_incidents`.
 * Consumed by the `camunda7:process-detail-header`, `-definition-kpi`,
 * `-definition-flow` and `camunda7:activity-incident-list` widgets.
 */
export const loadProcessIncidentsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-incidents",
  description:
    "One process definition key across all its versions: running instances, incidents, failed jobs, per-activity incident groups, the latest diagram. Powers the definition-view widgets (process-detail-header, process-definition-kpi, process-definition-flow, activity-incident-list).",
  dataType: "camunda7:processIncidents",
  requires: ["camunda7:processDefinitionKey"],
  optionalKeys: [ENGINE_KEY],
  produces: ["camunda7:processIncidentsData"],
  execute: async (context, appConfig) => {
    const { client, engineId, baseUrl, cockpitUrl, provider } = await stepEngine(context, appConfig)
    const data = {
      ...(await buildProcessIncidentsData(client, {
        baseUrl,
        cockpitUrl,
        provider,
        processDefinitionKey: requiredKey(context, "camunda7:processDefinitionKey"),
      })),
      engineId,
    }
    return {
      data,
      keys: { "camunda7:processIncidentsData": data },
      _app: "camunda7",
      _step: "load-process-incidents",
    }
  },
}
