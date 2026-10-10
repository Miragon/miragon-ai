import type { Client } from "@miragon-ai/camunda7-client"
import type { ActivityStat, BpmnViewerData } from "../view-models.js"
import {
  getActivityInstanceTree,
  getActivityStatistics,
  getIncidents,
  getJobs,
  getProcessDefinitions,
  getProcessInstance,
} from "@miragon-ai/camunda7-client/sdk"
import {
  collectActiveActivityIds,
  collectIncidentActivityIds,
  countActivityInstances,
} from "../lib/activity-tree.js"
import { fetchDefinitionXml, findLatestDefinition } from "./definition-info.js"
import { optional, rowsOf } from "./engine-reads.js"

export interface BpmnViewerTarget {
  /** Renders the diagram with live overlays (active activities, incidents). */
  processInstanceId?: string
  /** Renders a definition version's diagram; its badges count every running instance of it. */
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
 * The overlay numbers are scoped to the TARGET (#335 N66): for an instance,
 * token counts come from its activity-instance tree and failed jobs from its
 * own jobs — never from the definition's statistics, which span every running
 * instance of the version. `statsScope` names the scope for the widget.
 *
 * The overlays are primary: an unknown instance is the engine's 404 and a
 * failed overlay read is a tool error, never an instance without tokens. The
 * diagram XML is enrichment (null when unreadable). A definition key with no
 * matching version returns the empty shape (`processDefinitionId: null`).
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

  const [bpmnXml, overlays] = await Promise.all([
    // Enrichment: the overlays still answer "where is this instance stuck?".
    optional(fetchDefinitionXml(client, definitionId)),
    processInstanceId
      ? instanceOverlays(client, processInstanceId)
      : definitionOverlays(client, definitionId),
  ])

  return {
    bpmnXml,
    processInstanceId,
    processDefinitionId: definitionId,
    ...overlays,
    engineId,
  }
}

type Overlays = Pick<
  BpmnViewerData,
  "activeActivityIds" | "incidentActivityIds" | "activityStats" | "statsScope"
>

/** The instance's own state: its tokens, its incidents, its failed jobs. */
async function instanceOverlays(client: Client, processInstanceId: string): Promise<Overlays> {
  const [tree, incidents, failedJobs] = await Promise.all([
    getActivityInstanceTree({ client, path: { id: processInstanceId } }),
    getIncidents({ client, query: { processInstanceId } }).then((rows) => rowsOf(rows)),
    getJobs({ client, query: { processInstanceId, noRetriesLeft: true } }).then((rows) =>
      rowsOf<{ failedActivityId?: string | null }>(rows),
    ),
  ])
  const stats = new Map<string, ActivityStat>()
  const statOf = (id: string) => {
    const stat = stats.get(id) ?? { id, instances: 0, failedJobs: 0 }
    stats.set(id, stat)
    return stat
  }
  for (const [id, count] of countActivityInstances(tree)) statOf(id).instances = count
  for (const job of failedJobs) {
    if (job.failedActivityId) statOf(job.failedActivityId).failedJobs += 1
  }
  return {
    activeActivityIds: collectActiveActivityIds(tree),
    incidentActivityIds: collectIncidentActivityIds(incidents),
    activityStats: [...stats.values()],
    statsScope: "instance",
  }
}

/** A bare definition: the version's activity statistics (every running instance of it). */
async function definitionOverlays(client: Client, definitionId: string): Promise<Overlays> {
  const stats = rowsOf<{ id?: string | null; instances?: number; failedJobs?: number }>(
    await getActivityStatistics({
      client,
      path: { id: definitionId },
      query: { failedJobs: true },
    }),
  )
  return {
    activeActivityIds: [],
    incidentActivityIds: [],
    activityStats: stats.map((s) => ({
      id: s.id ?? "",
      instances: s.instances ?? 0,
      failedJobs: s.failedJobs ?? 0,
    })),
    statsScope: "definition",
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
  if (target.processDefinitionKey === undefined) return null
  if (target.version === undefined) {
    // The highest version over every tenant — the definition view's lookup.
    return (await findLatestDefinition(client, target.processDefinitionKey))?.id || null
  }
  const matches = rowsOf<{ id?: string }>(
    await getProcessDefinitions({
      client,
      query: { key: target.processDefinitionKey, version: target.version, maxResults: 1 },
    }),
  )
  return matches[0]?.id ?? null
}

/** The empty shape callers detect via `processDefinitionId === null`. */
function emptyViewerData(processInstanceId: string | null, engineId: string): BpmnViewerData {
  return {
    bpmnXml: null,
    processInstanceId,
    processDefinitionId: null,
    activeActivityIds: [],
    incidentActivityIds: [],
    activityStats: [],
    statsScope: processInstanceId ? "instance" : "definition",
    engineId,
  }
}
