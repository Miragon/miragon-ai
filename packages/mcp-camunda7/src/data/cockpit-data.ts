import type { Client } from "@miragon-ai/client-camunda7"
import type {
  CockpitDashboardData,
  InstanceDetailData,
  JobPanelData,
  ProcessInstancesData,
  ProcessListData,
  TaskData,
} from "../view-models.js"
import {
  getProcessDefinitions,
  getProcessDefinitionsCount,
  getProcessInstance,
  getProcessInstances,
  getProcessInstancesCount,
  getActivityInstanceTree,
  getProcessInstanceVariables,
  getIncidents,
  getTasks,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
  getJobs,
  getJobsCount,
} from "@miragon-ai/client-camunda7/sdk"
import { buildTaskFormSchema } from "../tools/task-form.js"
import { collectActiveActivityIds, collectIncidentActivityIds } from "../lib/activity-tree.js"
import { buildInstanceCockpitUrl } from "../lib/cockpit-url.js"
import type { EngineProvider } from "../engine-provider.js"
import type {
  JobsFilters,
  PagingArgs,
  ProcessInstancesFilters,
  ProcessListFilters,
} from "../feed-contracts.js"
import { processDefinitionKeyFromId } from "./incident-panel-data.js"

/**
 * Pure data builders shared by the `camunda7_show_*` widget tools AND the
 * data-only `camunda7_cockpit_data` feed. The widget tools wrap the result in a
 * UI view (`_meta.ui.resourceUri`); the cockpit app calls the data feed instead, because a
 * widget-tool result is rendered by the host rather than returned to an
 * in-widget `callTool()` — so the app would hang waiting for data.
 */

export async function buildCockpitDashboardData(
  client: Client,
  engineId: string,
): Promise<CockpitDashboardData> {
  let rows: Array<{
    id?: string | null
    instances?: number
    failedJobs?: number
    incidents?: Array<{ incidentType?: string | null; incidentCount?: number | null }> | null
    definition?: {
      id?: string | null
      key?: string | null
      name?: string | null
      version?: number | null
    }
  }> = []

  try {
    const stats = await getProcessDefinitionStatistics({
      client,
      query: { failedJobs: true, incidents: true },
    })
    rows = Array.isArray(stats) ? (stats as typeof rows) : []
  } catch {
    const [defs, incidents] = await Promise.all([
      getProcessDefinitions({
        client,
        query: { latestVersion: true, maxResults: 100, sortBy: "name", sortOrder: "asc" },
      }),
      getIncidents({ client, query: { maxResults: 500 } }).catch(() => []),
    ])
    const defArray = Array.isArray(defs) ? defs : []
    const incArray = Array.isArray(incidents) ? incidents : []

    const incByDef = new Map<string, number>()
    for (const inc of incArray as Array<{ processDefinitionId?: string }>) {
      const k = inc.processDefinitionId ?? ""
      incByDef.set(k, (incByDef.get(k) ?? 0) + 1)
    }

    rows = (
      defArray as Array<{
        id?: string | null
        key?: string | null
        name?: string | null
        version?: number | null
      }>
    ).map((d) => ({
      id: d.id,
      instances: 0,
      failedJobs: 0,
      incidents: incByDef.has(d.id ?? "")
        ? [{ incidentType: "failedJob", incidentCount: incByDef.get(d.id ?? "") ?? 0 }]
        : [],
      definition: d,
    }))
  }

  let totalRunning = 0
  let totalFailed = 0
  let totalIncidents = 0

  const definitions = rows.map((row) => {
    const incidents = (row.incidents ?? []).map((i) => ({
      incidentType: i.incidentType ?? "unknown",
      incidentCount: i.incidentCount ?? 0,
    }))
    const incidentSum = incidents.reduce((s, i) => s + i.incidentCount, 0)
    totalRunning += row.instances ?? 0
    totalFailed += row.failedJobs ?? 0
    totalIncidents += incidentSum
    return {
      id: row.definition?.id ?? row.id ?? "",
      key: row.definition?.key ?? "",
      name: row.definition?.name ?? null,
      version: row.definition?.version ?? 0,
      instances: row.instances ?? 0,
      failedJobs: row.failedJobs ?? 0,
      incidents,
    }
  })

  definitions.sort((a, b) => {
    const aIssues = a.failedJobs + a.incidents.reduce((s, i) => s + i.incidentCount, 0)
    const bIssues = b.failedJobs + b.incidents.reduce((s, i) => s + i.incidentCount, 0)
    if (aIssues !== bIssues) return bIssues - aIssues
    return b.instances - a.instances
  })

  return {
    summary: {
      totalDefinitions: definitions.length,
      totalRunningInstances: totalRunning,
      totalFailedJobs: totalFailed,
      totalIncidents,
    },
    definitions,
    engineId,
  }
}

/** Filters from the shared feed contract + paging; latestVersion defaults to true. */
export type ProcessListArgs = ProcessListFilters & PagingArgs

/**
 * One page of deployed process definitions with an honest total from
 * `/process-definition/count` — shared by `camunda7_show_process_list` and
 * its `camunda7_process_list_data` feed twin.
 */
export async function buildProcessListData(
  client: Client,
  engineId: string,
  args: ProcessListArgs,
): Promise<ProcessListData> {
  const filters = {
    key: args.key,
    nameLike: args.nameLike,
    latestVersion: args.latestVersion ?? true,
  }
  const [definitions, countRes] = await Promise.all([
    getProcessDefinitions({
      client,
      query: {
        ...filters,
        firstResult: Math.max(0, args.firstResult ?? 0),
        maxResults: args.maxResults ?? 50,
        sortBy: "name",
        sortOrder: "asc",
      },
    }),
    // Count failures degrade to the page length instead of failing the list.
    getProcessDefinitionsCount({ client, query: filters }).catch(() => null),
  ])
  const defArray = Array.isArray(definitions) ? definitions : []
  const count = (countRes as { count?: unknown } | null)?.count
  return {
    definitions: defArray as ProcessListData["definitions"],
    totalCount: typeof count === "number" ? count : defArray.length,
    filters: {
      key: args.key,
      nameLike: args.nameLike,
      latestVersion: filters.latestVersion,
    },
    engineId,
  }
}

export type ProcessInstancesArgs = ProcessInstancesFilters & PagingArgs

export async function buildProcessInstancesData(
  client: Client,
  engineId: string,
  args: ProcessInstancesArgs,
): Promise<ProcessInstancesData> {
  // The Camunda REST API only accepts `true` for active/suspended/withIncident
  // (a `false` is rejected), so only forward the flags when set.
  const filter = {
    processDefinitionKey: args.processDefinitionKey,
    active: args.active ? true : undefined,
    suspended: args.suspended ? true : undefined,
    withIncident: args.withIncidentsOnly ? true : undefined,
    businessKeyLike: args.businessKeyLike || undefined,
  }

  const [instancesRaw, countRes, defsRaw, incidentsRaw] = await Promise.all([
    getProcessInstances({
      client,
      query: {
        ...filter,
        firstResult: args.firstResult ?? 0,
        maxResults: args.maxResults ?? 50,
        sortBy: "businessKey",
        sortOrder: "asc",
      },
    }),
    getProcessInstancesCount({ client, query: filter }).catch(() => null),
    // Display-name lookup only makes sense with a definition scope; the
    // engine-wide list titles itself.
    args.processDefinitionKey
      ? getProcessDefinitions({
          client,
          query: { key: args.processDefinitionKey, latestVersion: true, maxResults: 1 },
        }).catch(() => [])
      : Promise.resolve([]),
    // /incident filters by `processDefinitionKeyIn` (comma list); one key here,
    // engine-wide when unscoped.
    getIncidents({
      client,
      query: { processDefinitionKeyIn: args.processDefinitionKey, maxResults: 2000 },
    }).catch(() => []),
  ])

  const instanceArray = (Array.isArray(instancesRaw) ? instancesRaw : []) as Array<{
    id?: string | null
    definitionId?: string | null
    businessKey?: string | null
    suspended?: boolean | null
  }>
  const defArray = (Array.isArray(defsRaw) ? defsRaw : []) as Array<{ name?: string | null }>
  const incidentArray = (Array.isArray(incidentsRaw) ? incidentsRaw : []) as Array<{
    processInstanceId?: string | null
  }>

  const incidentInstanceIds = new Set(
    incidentArray.map((i) => i.processInstanceId).filter((x): x is string => !!x),
  )

  // Camunda definition ids are `{key}:{version}:{deploymentId}`.
  const parseVersion = (definitionId: string | null | undefined): number | null => {
    const seg = definitionId?.split(":")[1]
    const n = seg ? Number(seg) : NaN
    return Number.isFinite(n) ? n : null
  }

  const instances: ProcessInstancesData["instances"] = instanceArray
    .filter((i): i is typeof i & { id: string } => !!i.id)
    .map((i) => ({
      id: i.id,
      businessKey: i.businessKey ?? null,
      processDefinitionKey: i.definitionId ? processDefinitionKeyFromId(i.definitionId) : null,
      version: parseVersion(i.definitionId),
      suspended: i.suspended ?? false,
      hasIncident: incidentInstanceIds.has(i.id),
    }))

  return {
    processDefinitionKey: args.processDefinitionKey ?? null,
    processDefinitionName: defArray[0]?.name ?? null,
    totalCount: (countRes as { count?: number } | null)?.count ?? instances.length,
    returnedCount: instances.length,
    withIncidentCount: instances.filter((i) => i.hasIncident).length,
    suspendedCount: instances.filter((i) => i.suspended).length,
    instances,
    filters: {
      active: args.active,
      suspended: args.suspended,
      withIncidentsOnly: args.withIncidentsOnly,
      businessKeyLike: args.businessKeyLike,
    },
    engineId,
  }
}

export async function buildInstanceDetailData(
  client: Client,
  engineId: string,
  args: { processInstanceId: string },
  /** Cockpit-URL context for the per-incident jump-out links; absent → null links. */
  urls?: { baseUrl: string; cockpitUrl?: string; provider: EngineProvider },
): Promise<InstanceDetailData> {
  const [instance, activityTree, variables, incidents, openTasksRaw] = await Promise.all([
    getProcessInstance({ client, path: { id: args.processInstanceId } }),
    getActivityInstanceTree({ client, path: { id: args.processInstanceId } }).catch(() => null),
    getProcessInstanceVariables({ client, path: { id: args.processInstanceId } }).catch(() => ({})),
    getIncidents({
      client,
      query: { processInstanceId: args.processInstanceId, maxResults: 100 },
    }).catch(() => []),
    getTasks({
      client,
      query: {
        processInstanceId: args.processInstanceId,
        maxResults: 50,
        sortBy: "created",
        sortOrder: "asc",
      },
    }).catch(() => []),
  ])

  let bpmnXml: string | null = null
  const definitionId = (instance as { definitionId?: string } | null)?.definitionId
  if (definitionId) {
    try {
      const xmlResponse = await getProcessDefinitionBpmn20Xml({
        client,
        path: { id: definitionId },
      })
      bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null
    } catch {
      bpmnXml = null
    }
  }

  const taskList = (Array.isArray(openTasksRaw) ? openTasksRaw : []) as TaskData[]
  const openTasks: InstanceDetailData["openTasks"] = await Promise.all(
    taskList.map(async (task) => ({
      ...task,
      formSchema: await buildTaskFormSchema(client, task.id, {
        task: {
          taskDefinitionKey: task.taskDefinitionKey,
          processDefinitionId: task.processDefinitionId,
        },
        bpmnXml,
      }).catch(() => ({ taskId: task.id, fields: [] })),
    })),
  )

  // Explicit mapping instead of a cast: the raw /incident rows carry no
  // cockpitInstanceUrl — the old `as unknown as` silently shipped rows whose
  // required url field was missing, so the per-incident Cockpit links never
  // rendered on the instance detail.
  const defKey = definitionId ? processDefinitionKeyFromId(definitionId) : null
  const versionSegment = definitionId?.split(":")[1]
  const defVersion = versionSegment && /^\d+$/.test(versionSegment) ? Number(versionSegment) : null
  const incidentRows: InstanceDetailData["incidents"] = (
    (Array.isArray(incidents) ? incidents : []) as Array<{
      id?: string | null
      processInstanceId?: string | null
      incidentType?: string | null
      incidentMessage?: string | null
      incidentTimestamp?: string | null
    }>
  ).map((i) => ({
    id: i.id ?? "",
    processInstanceId: i.processInstanceId ?? args.processInstanceId,
    incidentType: i.incidentType ?? "unknown",
    incidentMessage: i.incidentMessage ?? null,
    incidentTimestamp: i.incidentTimestamp ?? "",
    cockpitInstanceUrl:
      urls && defKey
        ? buildInstanceCockpitUrl(
            urls,
            {
              key: defKey,
              version: defVersion,
              definitionId: definitionId ?? null,
              instanceId: args.processInstanceId,
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
    bpmnXml,
    activeActivityIds: collectActiveActivityIds(activityTree),
    incidentActivityIds: collectIncidentActivityIds(incidents),
    openTasks,
    engineId,
  }
}

export async function buildJobPanelData(
  client: Client,
  engineId: string,
  args: JobsFilters & PagingArgs,
): Promise<JobPanelData> {
  const baseQuery = { processDefinitionKey: args.processDefinitionKey }
  // One page of jobs + two cheap /job/count calls so the KPIs and the "X of Y"
  // footer are the GLOBAL totals (not capped to the fetched page).
  const [jobsRaw, failedCountRes, allCountRes] = await Promise.all([
    getJobs({
      client,
      query: {
        ...baseQuery,
        noRetriesLeft: args.failedOnly ? true : undefined,
        firstResult: args.firstResult ?? 0,
        maxResults: args.maxResults ?? 50,
        sortBy: "jobId",
        sortOrder: "desc",
      },
    }).catch(() => []),
    getJobsCount({ client, query: { ...baseQuery, noRetriesLeft: true } }).catch(() => null),
    getJobsCount({ client, query: baseQuery }).catch(() => null),
  ])

  const raw = Array.isArray(jobsRaw)
    ? (jobsRaw as Array<{
        id: string
        processInstanceId: string
        processDefinitionKey?: string | null
        processDefinitionId?: string | null
        activityId?: string | null
        retries: number
        exceptionMessage?: string | null
        dueDate?: string | null
        suspended: boolean
        priority: number
        createTime?: string | null
      }>)
    : []

  const jobs = raw.map((j) => ({
    id: j.id,
    processInstanceId: j.processInstanceId,
    processDefinitionKey: j.processDefinitionKey ?? null,
    processDefinitionId: j.processDefinitionId ?? null,
    activityId: j.activityId ?? null,
    retries: j.retries,
    exceptionMessage: j.exceptionMessage ?? null,
    dueDate: j.dueDate ?? null,
    suspended: j.suspended,
    priority: j.priority,
    createTime: j.createTime ?? null,
  }))

  const failedCount = (failedCountRes as { count?: number } | null)?.count ?? 0
  const allCount = (allCountRes as { count?: number } | null)?.count ?? jobs.length

  return {
    totalCount: args.failedOnly ? failedCount : allCount,
    failedCount,
    jobs,
    filters: {
      processDefinitionKey: args.processDefinitionKey,
      failedOnly: args.failedOnly,
    },
    engineId,
  }
}
