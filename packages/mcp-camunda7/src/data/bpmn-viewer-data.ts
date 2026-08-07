import type { Client } from "@miragon-ai/client-camunda7"
import type { BpmnViewerData } from "../view-models.js"
import {
  getActivityInstanceTree,
  getActivityStatistics,
  getIncidents,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitions,
  getProcessInstance,
} from "@miragon-ai/client-camunda7/sdk"
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
  const processInstanceId = target.processInstanceId ?? null
  const definitionId = await resolveDefinitionId(client, target)

  if (!definitionId) {
    return emptyViewerData(processInstanceId, engineId)
  }

  const [xmlResponse, activityTree, incidents, stats] = await fetchViewerSources(
    client,
    definitionId,
    processInstanceId,
  )

  const bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? ""

  return {
    bpmnXml,
    processInstanceId,
    processDefinitionId: definitionId,
    activeActivityIds: processInstanceId ? collectActiveActivityIds(activityTree) : [],
    incidentActivityIds: processInstanceId ? collectIncidentActivityIds(incidents) : [],
    activityStats: mapActivityStats(stats),
    engineId,
  }
}

/** Resolves the viewer target to a concrete definition id, `null` when nothing matches. */
async function resolveDefinitionId(
  client: Client,
  target: BpmnViewerTarget,
): Promise<string | null> {
  if (target.processInstanceId) {
    const instance = (await getProcessInstance({
      client,
      path: { id: target.processInstanceId },
    })) as { definitionId?: string } | null
    return instance?.definitionId ?? null
  }
  if (target.processDefinitionKey) {
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
    return first?.id ?? null
  }
  return null
}

/** The empty shape callers detect via `processDefinitionId === null`. */
function emptyViewerData(processInstanceId: string | null, engineId: string): BpmnViewerData {
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

/** Fetches XML + overlay sources in parallel; each source degrades to empty on failure. */
function fetchViewerSources(
  client: Client,
  definitionId: string,
  processInstanceId: string | null,
) {
  return Promise.all([
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
}

function mapActivityStats(stats: unknown): BpmnViewerData["activityStats"] {
  const statRows = Array.isArray(stats)
    ? (stats as Array<{ id?: string | null; instances?: number; failedJobs?: number }>)
    : []
  return statRows.map((s) => ({
    id: s.id ?? "",
    instances: s.instances ?? 0,
    failedJobs: s.failedJobs ?? 0,
  }))
}
