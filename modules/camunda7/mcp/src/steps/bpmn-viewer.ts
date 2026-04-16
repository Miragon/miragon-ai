import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client, BpmnViewerData } from "@automation-mcp/client-camunda7"
import {
  getProcessInstance,
  getActivityInstanceTree,
  getIncidents,
  getProcessDefinitionBpmn20Xml,
  getActivityStatistics,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

interface ActivityInstanceNode {
  activityId?: string
  childActivityInstances?: ActivityInstanceNode[]
  childTransitionInstances?: Array<{ activityId?: string }>
}

interface IncidentRow {
  activityId?: string | null
}

interface StatRow {
  id?: string | null
  instances?: number
  failedJobs?: number
}

/** Recursively collect all active activity IDs from the tree. */
function collectActivityIds(node: ActivityInstanceNode | null): string[] {
  if (!node) return []
  const ids: string[] = []
  if (node.activityId) ids.push(node.activityId)
  for (const child of node.childActivityInstances ?? []) {
    ids.push(...collectActivityIds(child))
  }
  for (const t of node.childTransitionInstances ?? []) {
    if (t.activityId) ids.push(t.activityId)
  }
  return ids
}

/**
 * Loads data needed to render a BPMN diagram with activity overlays.
 * Consumed by `camunda7:bpmn-viewer`.
 */
export const loadBpmnViewerStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-bpmn-viewer",
  dataType: "camunda7:bpmnViewer",
  requires: ["camunda7:processInstanceId"],
  produces: ["camunda7:bpmnViewerData"],
  execute: async (context, appConfig) => {
    const client = appConfig.client
    const processInstanceId = context.keys["camunda7:processInstanceId"] as string

    // Fetch instance to get definition ID
    const instance = (await getProcessInstance({
      client,
      path: { id: processInstanceId },
    })) as { definitionId?: string } | null

    const definitionId = instance?.definitionId
    if (!definitionId) {
      const emptyData: BpmnViewerData = {
        bpmnXml: "",
        processInstanceId,
        processDefinitionId: null,
        activeActivityIds: [],
        incidentActivityIds: [],
        activityStats: [],
      }
      return {
        data: emptyData,
        keys: { "camunda7:bpmnViewerData": null },
        _app: "camunda7",
        _step: "load-bpmn-viewer",
      }
    }

    const [xmlResponse, activityTree, incidents, stats] = await Promise.all([
      getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } }).catch(() => null),
      getActivityInstanceTree({ client, path: { id: processInstanceId } }).catch(() => null),
      getIncidents({
        client,
        query: { processInstanceId, maxResults: 200 },
      }).catch(() => []),
      getActivityStatistics({
        client,
        path: { id: definitionId },
        query: { failedJobs: true, incidents: true },
      }).catch(() => []),
    ])

    const bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? ""
    const activeActivityIds = collectActivityIds(activityTree as ActivityInstanceNode | null)
    const incidentRows = Array.isArray(incidents) ? (incidents as IncidentRow[]) : []
    const incidentActivityIds = [
      ...new Set(incidentRows.map((i) => i.activityId).filter(Boolean) as string[]),
    ]
    const statRows = Array.isArray(stats) ? (stats as StatRow[]) : []
    const activityStats = statRows.map((s) => ({
      id: s.id ?? "",
      instances: s.instances ?? 0,
      failedJobs: s.failedJobs ?? 0,
    }))

    const data: BpmnViewerData = {
      bpmnXml,
      processInstanceId,
      processDefinitionId: definitionId,
      activeActivityIds,
      incidentActivityIds,
      activityStats,
    }

    return {
      data,
      keys: { "camunda7:bpmnViewerData": data },
      _app: "camunda7",
      _step: "load-bpmn-viewer",
    }
  },
}
