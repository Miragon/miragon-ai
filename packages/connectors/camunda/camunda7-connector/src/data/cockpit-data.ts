import { complementaryFlags, engineLike, trueOnly, type Client } from "@miragon-ai/camunda7-client"
import type {
  CockpitDashboardData,
  DefinitionStat,
  JobPanelData,
  ProcessInstanceRow,
  ProcessInstancesData,
  ProcessListData,
} from "../view-models.js"
import {
  getProcessDefinitions,
  getProcessDefinitionsCount,
  getProcessInstances,
  getProcessInstancesCount,
  getJobs,
  getJobsCount,
} from "@miragon-ai/camunda7-client/sdk"
import type {
  JobsFilters,
  PagingArgs,
  ProcessInstancesFilters,
  ProcessListFilters,
} from "../feed-contracts.js"
import {
  definitionKeyInId,
  definitionVersionFromId,
  fetchLatestDefinition,
  fetchStatsByKey,
  resolveDefinitionKeys,
} from "./definition-info.js"
import { countOf, optional, rowsOf } from "./engine-reads.js"

/**
 * Pure data builders shared by the `camunda7_show_*` widget tools, their
 * app-only `*_data` feeds and the pipeline steps. Every one follows the
 * honest-numbers rule (`./engine-reads.ts`): primary rows and counts
 * propagate engine failures, enrichment degrades to null.
 */

/**
 * The process landscape, one row per KEY (#335 N60): instances, failed jobs
 * and incidents summed over every deployed version — the scope of the
 * definition view each row drills into. One engine-wide statistics call; its
 * failure is the view's failure (no "0 instances" fallback).
 */
export async function buildCockpitDashboardData(
  client: Client,
  engineId: string,
): Promise<CockpitDashboardData> {
  const statsByKey = await fetchStatsByKey(client, { failedJobs: true })

  const definitions: DefinitionStat[] = [...statsByKey.entries()].map(([key, stats]) => ({
    id: stats.latest.id,
    key,
    name: stats.latest.name,
    latestVersion: stats.latest.version,
    instances: stats.instances,
    failedJobs: stats.failedJobs,
    incidents: [...stats.incidentsByType.entries()].map(([incidentType, incidentCount]) => ({
      incidentType,
      incidentCount,
    })),
  }))

  const issuesOf = (d: DefinitionStat) =>
    d.failedJobs + d.incidents.reduce((s, i) => s + i.incidentCount, 0)
  definitions.sort((a, b) => issuesOf(b) - issuesOf(a) || b.instances - a.instances)

  return {
    summary: {
      totalDefinitions: definitions.length,
      totalRunningInstances: definitions.reduce((s, d) => s + d.instances, 0),
      totalFailedJobs: definitions.reduce((s, d) => s + d.failedJobs, 0),
      totalIncidents: definitions.reduce(
        (s, d) => s + d.incidents.reduce((t, i) => t + i.incidentCount, 0),
        0,
      ),
    },
    definitions,
    engineId,
  }
}

/** Filters from the shared feed contract + paging; latestVersion defaults to true. */
export type ProcessListArgs = ProcessListFilters & PagingArgs

/**
 * One page of deployed process definitions with the exact total from
 * `/process-definition/count` — shared by `camunda7_show_process_list`, its
 * `camunda7_process_list_data` feed and the `camunda7:load-process-definitions` step.
 */
export async function buildProcessListData(
  client: Client,
  engineId: string,
  args: ProcessListArgs,
): Promise<ProcessListData> {
  const latestVersion = args.latestVersion ?? true
  const filters = {
    key: args.processDefinitionKey,
    nameLike: engineLike(args.nameLike),
    latestVersion: trueOnly(latestVersion),
  }
  const [definitions, totalCount] = await Promise.all([
    getProcessDefinitions({
      client,
      query: {
        ...filters,
        firstResult: Math.max(0, args.firstResult ?? 0),
        maxResults: args.maxResults ?? 50,
        sortBy: "name",
        sortOrder: "asc",
      },
    }).then((rows) => rowsOf<ProcessListData["definitions"][number]>(rows)),
    getProcessDefinitionsCount({ client, query: filters }).then(countOf),
  ])
  return {
    definitions,
    totalCount,
    filters: {
      processDefinitionKey: args.processDefinitionKey,
      nameLike: args.nameLike,
      latestVersion,
    },
    engineId,
  }
}

export type ProcessInstancesArgs = ProcessInstancesFilters & PagingArgs

// The engine IGNORES `false` for active/suspended/withIncident (HTTP 200, no
// filter — not a rejection), so a forwarded false would silently list every
// instance: active/suspended send a false as the complement, withIncident
// only ever goes out as true. businessKeyLike is a LIKE pattern — a value
// without `%` would match the business key exactly.
function toProcessInstanceFilter(args: ProcessInstancesArgs) {
  return {
    processDefinitionKey: args.processDefinitionKey,
    ...complementaryFlags(args, "active", "suspended"),
    withIncident: trueOnly(args.withIncidents),
    businessKeyLike: engineLike(args.businessKeyLike),
  }
}

type ProcessInstanceFilter = ReturnType<typeof toProcessInstanceFilter>

interface RawInstance {
  id?: string | null
  definitionId?: string | null
  businessKey?: string | null
  suspended?: boolean | null
}

/**
 * Totals over the WHOLE filtered set (#335 N65) — never counts of the
 * returned page. A filter that already decides a total answers it without a
 * call (`withIncident` = every match, `active` = none suspended).
 */
function filteredTotals(client: Client, filter: ProcessInstanceFilter) {
  const count = (query: ProcessInstanceFilter) =>
    getProcessInstancesCount({ client, query }).then(countOf)
  const total = count(filter)
  return Promise.all([
    total,
    filter.withIncident ? total : count({ ...filter, withIncident: true }),
    filter.suspended
      ? total
      : filter.active
        ? Promise.resolve(0)
        : count({ ...filter, suspended: true }),
  ])
}

/**
 * Which of THIS page's instances have an open incident — one query scoped to
 * the page's ids (#335 N65), not an engine-wide incident scan.
 */
async function instancesWithIncident(
  client: Client,
  pageIds: string[],
  filter: ProcessInstanceFilter,
): Promise<Set<string>> {
  if (filter.withIncident || pageIds.length === 0) {
    return new Set(filter.withIncident ? pageIds : [])
  }
  const flagged = rowsOf<RawInstance>(
    await getProcessInstances({
      client,
      query: {
        processInstanceIds: pageIds.join(","),
        withIncident: true,
        maxResults: pageIds.length,
      },
    }),
  )
  return new Set(flagged.map((i) => i.id).filter((id): id is string => !!id))
}

/**
 * The definition key each row runs on — what the engine-wide list's process
 * column drills into and the root-cause hand-off scopes by. A scoped list's
 * rows all run on its key. Elsewhere a bare generated definition id (long
 * keys) resolves through the statistics — at most ONE read per page, and
 * ENRICHMENT: a failed read leaves those keys null ("—", no drill), never a
 * UUID passed off as a key.
 */
async function rowKeyResolver(
  client: Client,
  page: RawInstance[],
  scopedKey: string | undefined,
): Promise<(definitionId: string) => string | null> {
  if (scopedKey) return () => scopedKey
  const keys = resolveDefinitionKeys(
    client,
    page.map((i) => i.definitionId),
  )
  return (await optional(keys)) ?? definitionKeyInId
}

export async function buildProcessInstancesData(
  client: Client,
  engineId: string,
  args: ProcessInstancesArgs,
): Promise<ProcessInstancesData> {
  const filter = toProcessInstanceFilter(args)

  const [raw, [totalCount, withIncidentCount, suspendedCount], definition] = await Promise.all([
    getProcessInstances({
      client,
      query: {
        ...filter,
        firstResult: args.firstResult ?? 0,
        maxResults: args.maxResults ?? 50,
        sortBy: "businessKey",
        sortOrder: "asc",
      },
    }).then((rows) => rowsOf<RawInstance>(rows)),
    filteredTotals(client, filter),
    // A scoped list names its definition — and an unknown key is the
    // engine's 404, not "0 running instances".
    args.processDefinitionKey
      ? fetchLatestDefinition(client, args.processDefinitionKey)
      : Promise.resolve(null),
  ])

  const page = raw.filter((i): i is RawInstance & { id: string } => !!i.id)
  const [flagged, keyOf] = await Promise.all([
    instancesWithIncident(
      client,
      page.map((i) => i.id),
      filter,
    ),
    rowKeyResolver(client, page, args.processDefinitionKey),
  ])
  const instances: ProcessInstanceRow[] = page.map((i) => ({
    id: i.id,
    businessKey: i.businessKey ?? null,
    processDefinitionKey: i.definitionId ? keyOf(i.definitionId) : null,
    version: definitionVersionFromId(i.definitionId),
    suspended: i.suspended ?? false,
    hasIncident: flagged.has(i.id),
  }))

  return {
    processDefinitionKey: args.processDefinitionKey ?? null,
    processDefinitionName: definition?.name ?? null,
    totalCount,
    returnedCount: instances.length,
    withIncidentCount,
    suspendedCount,
    instances,
    filters: {
      active: args.active,
      suspended: args.suspended,
      withIncidents: args.withIncidents,
      businessKeyLike: args.businessKeyLike,
    },
    engineId,
  }
}

interface RawJob {
  id: string
  processInstanceId: string
  processDefinitionKey?: string | null
  processDefinitionId?: string | null
  failedActivityId?: string | null
  retries: number
  exceptionMessage?: string | null
  dueDate?: string | null
  suspended: boolean
  priority: number
  createTime?: string | null
}

/**
 * One page of jobs plus the two GLOBAL totals (`/job/count`) behind the KPIs
 * and the "X of Y" footer. All three are primary: an unreachable engine is a
 * tool error, never "0 jobs, 0 failed".
 */
export async function buildJobPanelData(
  client: Client,
  engineId: string,
  args: JobsFilters & PagingArgs,
): Promise<JobPanelData> {
  const baseQuery = { processDefinitionKey: args.processDefinitionKey }
  const [raw, failedCount, allCount] = await Promise.all([
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
    }).then((rows) => rowsOf<RawJob>(rows)),
    getJobsCount({ client, query: { ...baseQuery, noRetriesLeft: true } }).then(countOf),
    getJobsCount({ client, query: baseQuery }).then(countOf),
    // A scoped panel for an unknown key is the engine's 404, not "0 jobs".
    args.processDefinitionKey
      ? fetchLatestDefinition(client, args.processDefinitionKey)
      : Promise.resolve(null),
  ])

  return {
    totalCount: args.failedOnly ? failedCount : allCount,
    failedCount,
    jobs: raw.map((j) => ({
      id: j.id,
      processInstanceId: j.processInstanceId,
      processDefinitionKey: j.processDefinitionKey ?? null,
      processDefinitionId: j.processDefinitionId ?? null,
      // The engine's job carries the activity it failed at, not an `activityId`.
      activityId: j.failedActivityId ?? null,
      retries: j.retries,
      exceptionMessage: j.exceptionMessage ?? null,
      dueDate: j.dueDate ?? null,
      suspended: j.suspended,
      priority: j.priority,
      createTime: j.createTime ?? null,
    })),
    filters: {
      processDefinitionKey: args.processDefinitionKey,
      failedOnly: args.failedOnly,
    },
    engineId,
  }
}
