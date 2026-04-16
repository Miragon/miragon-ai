import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client } from "@miragon-ai/client-camunda7"
import { getIncidents } from "@miragon-ai/client-camunda7/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

interface IncidentRow {
  id: string
  processDefinitionKey: string
  processDefinitionId: string
  processInstanceId: string
  incidentType: string
  activityId: string
  incidentMessage: string | null
  incidentTimestamp: string
  configuration: string | null
}

/**
 * Loads open incidents grouped by process definition. Consumed by
 * `camunda7:incident-panel`.
 */
export const loadIncidentPanelStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-incident-panel",
  dataType: "camunda7:incidentPanel",
  requires: [],
  produces: ["camunda7:incidentPanelData"],
  execute: async (context, appConfig) => {
    const client = appConfig.client
    const processDefinitionKey = context.keys["camunda7:processDefinitionKey"] as string | undefined
    const incidentType = context.keys["camunda7:incidentType"] as string | undefined

    const rows = (await getIncidents({
      client,
      query: {
        processDefinitionKeyIn: processDefinitionKey,
        incidentType,
        maxResults: 200,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
      },
    })) as unknown as IncidentRow[]

    const byDefinition = new Map<string, IncidentRow[]>()
    for (const row of rows) {
      const key = row.processDefinitionKey
      const group = byDefinition.get(key) ?? []
      group.push(row)
      byDefinition.set(key, group)
    }

    const definitions = [...byDefinition.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, group]) => ({
        processDefinitionKey: key,
        incidentCount: group.length,
        latestIncident: group[0].incidentTimestamp,
        incidents: group.map((r) => ({
          id: r.id,
          processDefinitionId: r.processDefinitionId,
          processInstanceId: r.processInstanceId,
          incidentType: r.incidentType,
          activityId: r.activityId,
          incidentMessage: r.incidentMessage ?? null,
          incidentTimestamp: r.incidentTimestamp,
          configuration: r.configuration ?? null,
        })),
      }))

    const data = { totalCount: rows.length, definitions }
    return {
      data,
      keys: { "camunda7:incidentPanelData": data },
      _app: "camunda7",
      _step: "load-incident-panel",
    }
  },
}
