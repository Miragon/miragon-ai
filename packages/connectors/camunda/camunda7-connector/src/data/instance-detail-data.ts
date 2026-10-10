import {
  incidentRecovery,
  readProcessInstanceVariables,
  type Client,
} from "@miragon-ai/camunda7-client"
import type { InstanceDetailData, TaskData } from "../view-models.js"
import {
  getActivityInstanceTree,
  getIncidents,
  getIncidentsCount,
  getProcessDefinitionBpmn20Xml,
  getProcessInstance,
  getTasks,
  getTasksCount,
} from "@miragon-ai/camunda7-client/sdk"
import { buildTaskFormSchema } from "../tools/task-form.js"
import { collectActiveActivityIds, collectIncidentActivityIds } from "../lib/activity-tree.js"
import { buildInstanceCockpitUrl } from "../lib/cockpit-url.js"
import type { EngineProvider } from "../engine-provider.js"
import {
  definitionKeyInId,
  definitionVersionFromId,
  resolveDefinitionKeys,
} from "./definition-info.js"
import { countOf, optional, rowsOf } from "./engine-reads.js"

/** Rows the payload carries per list; the exact totals come from `/count`. */
const INCIDENT_ROWS = 100
const TASK_ROWS = 50

interface RawIncident {
  id?: string | null
  processInstanceId?: string | null
  incidentType?: string | null
  incidentMessage?: string | null
  incidentTimestamp?: string | null
  activityId?: string | null
  configuration?: string | null
}

/** The diagram of a definition — null when the read fails (the forms are then UNKNOWN). */
async function readBpmnXml(
  client: Client,
  definitionId: string | undefined,
): Promise<{ bpmnXml: string | null; unreadable: boolean }> {
  if (!definitionId) return { bpmnXml: null, unreadable: false }
  try {
    const res = await getProcessDefinitionBpmn20Xml({ client, path: { id: definitionId } })
    return { bpmnXml: (res as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null, unreadable: false }
  } catch {
    return { bpmnXml: null, unreadable: true }
  }
}

/**
 * The key the per-incident cockpit links address — read only when there are
 * links to build. The id names it, unless it is a bare generated one (long
 * keys): then the definition statistics resolve it (`resolveDefinitionKeys`)
 * as ENRICHMENT — a failed read is no link, never the UUID as a key.
 */
async function linkDefinitionKey(
  client: Client,
  definitionId: string | undefined,
  needed: boolean,
): Promise<string | null> {
  if (!needed || !definitionId) return null
  const keyOf = (await optional(resolveDefinitionKeys(client, [definitionId]))) ?? definitionKeyInId
  return keyOf(definitionId)
}

/**
 * One running instance: its state, tokens, variables, open incidents and open
 * user tasks are PRIMARY — the summary reports them as facts, so a failed
 * read is a tool error, never "0 open incidents". The lists are capped, their
 * totals come from `/count`. The diagram, the task forms and the incidents'
 * cockpit links are enrichment (null when unreadable).
 */
export async function buildInstanceDetailData(
  client: Client,
  engineId: string,
  args: { processInstanceId: string },
  /** Cockpit-URL context for the per-incident jump-out links; absent → null links. */
  urls?: { baseUrl: string; cockpitUrl?: string; provider: EngineProvider },
): Promise<InstanceDetailData> {
  const id = args.processInstanceId
  const byInstance = { processInstanceId: id }
  const [instance, activityTree, variables, incidents, incidentCount, openTasksRaw, openTaskCount] =
    await Promise.all([
      getProcessInstance({ client, path: { id } }),
      getActivityInstanceTree({ client, path: { id } }),
      readProcessInstanceVariables(client, id),
      getIncidents({ client, query: { ...byInstance, maxResults: INCIDENT_ROWS } }).then((rows) =>
        rowsOf<RawIncident>(rows),
      ),
      getIncidentsCount({ client, query: byInstance }).then(countOf),
      getTasks({
        client,
        query: { ...byInstance, maxResults: TASK_ROWS, sortBy: "created", sortOrder: "asc" },
      }).then((rows) => rowsOf<TaskData>(rows)),
      getTasksCount({ client, query: byInstance }).then(countOf),
    ])

  const definitionId = (instance as { definitionId?: string } | null)?.definitionId
  const [{ bpmnXml, unreadable }, defKey] = await Promise.all([
    readBpmnXml(client, definitionId),
    linkDefinitionKey(client, definitionId, !!urls && incidents.length > 0),
  ])

  const openTasks: InstanceDetailData["openTasks"] = await Promise.all(
    openTasksRaw.map(async (task) => ({
      ...task,
      // A schema that cannot be built is null, never `{ fields: [] }` ("no
      // form"): the widget then loads it through camunda7_get_task_form,
      // which fails loudly instead of offering a form task without its form.
      formSchema: unreadable
        ? null
        : await buildTaskFormSchema(client, task.id, { task, bpmnXml }).catch(() => null),
    })),
  )

  const incidentRows: InstanceDetailData["incidents"] = incidents.map((i) => ({
    id: i.id ?? "",
    processInstanceId: i.processInstanceId ?? id,
    incidentType: i.incidentType ?? "unknown",
    incidentMessage: i.incidentMessage ?? null,
    incidentTimestamp: i.incidentTimestamp ?? "",
    recovery: incidentRecovery(i),
    cockpitInstanceUrl:
      urls && defKey
        ? buildInstanceCockpitUrl(
            urls,
            {
              key: defKey,
              version: definitionVersionFromId(definitionId),
              definitionId: definitionId ?? null,
              instanceId: id,
            },
            { tab: "incidents" },
          )
        : null,
  }))

  return {
    instance: instance as unknown as InstanceDetailData["instance"],
    activityTree: activityTree as unknown as InstanceDetailData["activityTree"],
    variables: variables as unknown as InstanceDetailData["variables"],
    incidents: incidentRows,
    incidentCount,
    bpmnXml,
    activeActivityIds: collectActiveActivityIds(activityTree),
    incidentActivityIds: collectIncidentActivityIds(incidents),
    openTasks,
    openTaskCount,
    engineId,
  }
}
