import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import {
  buildIncidentsDashboardData,
  buildProcessIncidentsData,
} from "../data/incident-panel-data.js"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads the open-incidents overview (all processes) — KPIs, per-process cards
 * with a per-activity summary. Consumed by `camunda7:incidents-dashboard`.
 */
export const loadIncidentsDashboardStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-incidents-dashboard",
  dataType: "camunda7:incidentsDashboard",
  requires: [],
  produces: ["camunda7:incidentsDashboardData"],
  execute: async (context, appConfig) => {
    const { client, baseUrl, cockpitUrl } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
    const processDefinitionKey = context.keys["camunda7:processDefinitionKey"] as string | undefined
    const incidentType = context.keys["camunda7:incidentType"] as string | undefined

    const data = await buildIncidentsDashboardData(client, {
      baseUrl,
      cockpitUrl,
      processDefinitionKey,
      incidentType,
    })

    return {
      data,
      keys: { "camunda7:incidentsDashboardData": data },
      _app: "camunda7",
      _step: "load-incidents-dashboard",
    }
  },
}

/**
 * Loads the per-process incident detail — BPMN, activity groups with the full
 * incident table. Consumed by `camunda7:process-incidents`.
 */
export const loadProcessIncidentsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-incidents",
  dataType: "camunda7:processIncidents",
  requires: ["camunda7:processDefinitionKey"],
  produces: ["camunda7:processIncidentsData"],
  execute: async (context, appConfig) => {
    const { client, baseUrl, cockpitUrl } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
    const processDefinitionKey = context.keys["camunda7:processDefinitionKey"] as string

    const data = await buildProcessIncidentsData(client, {
      baseUrl,
      cockpitUrl,
      processDefinitionKey,
    })

    return {
      data,
      keys: { "camunda7:processIncidentsData": data },
      _app: "camunda7",
      _step: "load-process-incidents",
    }
  },
}
