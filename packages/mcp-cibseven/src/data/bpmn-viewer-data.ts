import type { Client } from "@miragon-ai/client-cibseven"
import type { BpmnViewerData } from "../view-models.js"
import {
  getActivityInstanceTree,
  getActivityStatistics,
  getIncidents,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitions,
  getProcessInstance,
} from "@miragon-ai/client-cibseven/sdk"
import { collectActiveActivityIds, collectIncidentActivityIds } from "../lib/activity-tree.js"

export interface BpmnViewerTarget {
  /** Renders the diagram with live overlays (active activities, incidents). */
  processInstanceId?: string
  /** Renders the static diagram of a definition (no instance overlays). */
  processDefinitionKey?: string
  /** Specific definition version; latest when omitted. Needs `processDefinitionKey`. */
  version?: number
}

/**
 * Assembles the BPMN viewer data (XML + activity overlays) for a running
 * instance or a bare definition. THE single builder behind BOTH render paths —
 * the `camunda7_show_bpmn_viewer` widget tool and the `camunda7:load-bpmn-viewer`
 * pipeline step — so overlay behavior cannot drift between them.
 *
 * When the target cannot be resolved to a definition, the empty shape
 * (`processDefinitionId: null`, no XML) is returned; callers detect that via
 * `processDefinitionId === null`.
 */
export async function buildBpmnViewerData(
  client: Client,
  engineId: string,
  target: BpmnViewerTarget,
): Promise<BpmnViewerData> {
  let definitionId: string | null = null
  const processInstanceId = target.processInstanceId ?? null

  if (target.processInstanceId) {
    const instance = (await getProcessInstance({
      client,
      path: { id: target.processInstanceId },
    })) as { definitionId?: string } | null
    definitionId = instance?.definitionId ?? null
  } else if (target.processDefinitionKey) {
    const matches = await getProcessDefinitions({
      client,
      query: {
        key: target.processDefinitionKey,
        version: target.version,
        latestVersion: target.version === undefined ? true : undefined,
        maxResults: 1,
      },
    })
    const first = Array.isArray(matches) ? (matches[0] as { id?: string } | undefined) : null
    definitionId = first?.id ?? null
  }

  if (!definitionId) {
    return {
      bpmnXml: "",
      processInstanceId,
      processDefinitionId: null,
      activeActivityIds: [],
      incidentActivityIds: [],
      activityStats: [],
      engineId,
    }
  }

  const [xmlResponse, activityTree, incidents, stats] = await Promise.all([
    getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } }).catch(() => null),
    processInstanceId
      ? getActivityInstanceTree({ client, path: { id: processInstanceId } }).catch(() => null)
      : Promise.resolve(null),
    processInstanceId
      ? getIncidents({ client, query: { processInstanceId, maxResults: 200 } }).catch(() => [])
      : Promise.resolve([]),
    // `incidents: true` is deliberately NOT requested: incident overlays come
    // from the /incident rows above, the statistics only feed token counts and
    // failed-job badges.
    getActivityStatistics({
      client,
      path: { id: definitionId },
      query: { failedJobs: true },
    }).catch(() => []),
  ])

  const bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? ""
  const statRows = Array.isArray(stats)
    ? (stats as Array<{ id?: string | null; instances?: number; failedJobs?: number }>)
    : []

  return {
    bpmnXml,
    processInstanceId,
    processDefinitionId: definitionId,
    activeActivityIds: processInstanceId ? collectActiveActivityIds(activityTree) : [],
    incidentActivityIds: processInstanceId ? collectIncidentActivityIds(incidents) : [],
    activityStats: statRows.map((s) => ({
      id: s.id ?? "",
      instances: s.instances ?? 0,
      failedJobs: s.failedJobs ?? 0,
    })),
    engineId,
  }
}
