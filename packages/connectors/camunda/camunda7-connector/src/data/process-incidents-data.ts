import { latestEngineDate, toEngineDate, type Client } from "@miragon-ai/camunda7-client"
import {
  getActivityStatistics,
  getIncidents,
  getIncidentsCount,
  getJobsCount,
  getProcessDefinitionBpmn20XmlByKey,
  getProcessInstancesCount,
} from "@miragon-ai/camunda7-client/sdk"
import type {
  ActivityIncidentsData,
  IncidentsByProcess,
  ProcessIncidentsActivity,
  ProcessIncidentsData,
} from "../view-models.js"
import type { ActivityIncidentsFilters, PagingArgs } from "../feed-contracts.js"
import type { EngineProvider } from "../engine-provider.js"
import { buildProcessCockpitUrl } from "../lib/cockpit-url.js"
import { countBpmnActivities, extractActivityNames } from "../lib/bpmn-parse.js"
import { fetchLatestDefinition, fetchStatsByKey } from "./definition-info.js"
import { countOf, DAY_MS, optional, rowsOf } from "./engine-reads.js"
import {
  groupBy,
  scanFacts,
  scanIncidents,
  toIncidentInstance,
  type IncidentRow,
  type IncidentScan,
} from "./incident-scan.js"

export interface ProcessIncidentsOptions {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
  processDefinitionKey: string
}

/**
 * The unified definition view — KEY-wide (#335 N60). Old versions keep
 * running after a redeploy, so every number covers every version of the key:
 * running instances, failed jobs and incidents come from key-scoped `/count`
 * endpoints, the per-activity incident counts are summed over all versions.
 * Only the diagram is one version (the latest, `diagramVersion`). Independent
 * reads run in one parallel stage (N67); the engine-wide definition
 * statistics are read only when the key's incidents outrun the recency scan
 * or the empty state looks for other processes.
 */
export async function buildProcessIncidentsData(
  client: Client,
  options: ProcessIncidentsOptions,
): Promise<ProcessIncidentsData> {
  const key = options.processDefinitionKey
  const cutoffMs = Date.now() - DAY_MS
  const byKey = { processDefinitionKeyIn: key }
  const [definition, xml, runningInstances, failedJobs, incidentCount, last24hCount, scan] =
    await Promise.all([
      // Primary: an unknown key is the engine's 404 — a not-found error, never zeros.
      fetchLatestDefinition(client, key),
      optional(getProcessDefinitionBpmn20XmlByKey({ client, path: { key } })),
      getProcessInstancesCount({ client, query: { processDefinitionKey: key } }).then(countOf),
      getJobsCount({ client, query: { processDefinitionKey: key, noRetriesLeft: true } }).then(
        countOf,
      ),
      getIncidentsCount({ client, query: byKey }).then(countOf),
      getIncidentsCount({
        client,
        query: { ...byKey, incidentTimestampAfter: toEngineDate(new Date(cutoffMs)) },
      }).then(countOf),
      scanIncidents(client, byKey),
    ])

  const [activityCounts, siblingsWithIncidents] = await Promise.all([
    activityIncidentCounts(client, key, scan),
    // The empty state offers processes that DO have incidents — enrichment.
    incidentCount === 0 ? optional(fetchSiblingsWithIncidents(client, key)) : Promise.resolve([]),
  ])

  const bpmnXml = (xml as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null
  return {
    processDefinitionKey: key,
    processDefinitionName: definition.name,
    diagramVersion: definition.version,
    bpmnXml,
    cockpitUrl: buildProcessCockpitUrl(
      options,
      { key, version: definition.version, definitionId: definition.id || null },
      { tab: "incidents" },
    ),
    runningInstances,
    incidentCount,
    last24hCount,
    failedJobs,
    totalActivityCount: bpmnXml ? countBpmnActivities(bpmnXml) : null,
    latestIncident: latestEngineDate(scan.rows.map((r) => r.incidentTimestamp)),
    activities: toActivities(activityCounts, scan, {
      names: bpmnXml ? extractActivityNames(bpmnXml) : {},
      cutoffMs,
    }),
    siblingsWithIncidents,
  }
}

function toActivities(
  counts: Map<string, number>,
  scan: IncidentScan,
  ctx: { names: Record<string, string>; cutoffMs: number },
): ProcessIncidentsActivity[] {
  const scanned = groupBy(scan.rows, (r) => r.activityId)
  return [...counts.entries()]
    .map(([activityId, incidentCount]) => {
      const rows = scanned.get(activityId) ?? []
      const facts = scanFacts(rows, {
        fullyScanned: rows.length >= incidentCount,
        scan,
        cutoffMs: ctx.cutoffMs,
      })
      return {
        activityId,
        activityName: ctx.names[activityId] ?? null,
        representativeMessage: facts.representativeMessage,
        incidentCount,
        firstSeen: facts.firstSeen,
        latestIncident: facts.latestIncident,
      }
    })
    .sort((a, b) => b.incidentCount - a.incidentCount)
}

/**
 * Exact open-incident count per activity, over EVERY version of the key. A
 * complete scan already holds every incident; otherwise the activity
 * statistics of each version with incidents are summed (one call per such
 * version, in parallel).
 */
async function activityIncidentCounts(
  client: Client,
  key: string,
  scan: IncidentScan,
): Promise<Map<string, number>> {
  if (scan.complete) {
    return new Map(
      [...groupBy(scan.rows, (r: IncidentRow) => r.activityId)].map(([id, rows]) => [
        id,
        rows.length,
      ]),
    )
  }
  const versionIds = (await fetchStatsByKey(client, {})).get(key)?.incidentVersionIds ?? []
  const perVersion = await Promise.all(
    versionIds.map((id) =>
      getActivityStatistics({ client, path: { id }, query: { incidents: true } }).then((rows) =>
        rowsOf<{ id?: string | null; incidents?: Array<{ incidentCount?: number | null }> | null }>(
          rows,
        ),
      ),
    ),
  )
  const counts = new Map<string, number>()
  for (const row of perVersion.flat()) {
    const count = (row.incidents ?? []).reduce((sum, i) => sum + (i.incidentCount ?? 0), 0)
    if (row.id && count > 0) counts.set(row.id, (counts.get(row.id) ?? 0) + count)
  }
  return counts
}

/** Other keys with open incidents (summed over their versions), most first. */
async function fetchSiblingsWithIncidents(
  client: Client,
  excludeKey: string,
): Promise<IncidentsByProcess[]> {
  return [...(await fetchStatsByKey(client, {})).entries()]
    .filter(([key, stats]) => key !== excludeKey && stats.incidentCount > 0)
    .map(([key, stats]) => ({
      processDefinitionKey: key,
      processDefinitionName: stats.latest.name,
      incidentCount: stats.incidentCount,
    }))
    .sort((a, b) => b.incidentCount - a.incidentCount)
}

/** Filters from the shared feed contract + paging (page size defaults to 10). */
export type ActivityIncidentsArgs = ActivityIncidentsFilters & PagingArgs

/** Server default page size of the per-activity incident feed. */
const ACTIVITY_INCIDENTS_PAGE = 10

/**
 * One page of an activity's incident rows (every version of the key) — the
 * paged feed behind each expanded activity group of the definition view.
 * Engine-side offset paging with the exact total from `/incident/count`; each
 * row links to the instance on its OWN definition version, so no definition
 * lookup runs per page (N67).
 */
export async function buildActivityIncidentsData(
  client: Client,
  options: {
    baseUrl: string
    cockpitUrl?: string
    provider: EngineProvider
  } & ActivityIncidentsArgs,
): Promise<Omit<ActivityIncidentsData, "engineId">> {
  const query = {
    processDefinitionKeyIn: options.processDefinitionKey,
    activityId: options.activityId,
  }
  const [raw, totalCount] = await Promise.all([
    getIncidents({
      client,
      query: {
        ...query,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
        firstResult: Math.max(0, options.firstResult ?? 0),
        maxResults: options.maxResults ?? ACTIVITY_INCIDENTS_PAGE,
      },
    }).then((rows) => rowsOf<Omit<IncidentRow, "processDefinitionKey">>(rows)),
    getIncidentsCount({ client, query }).then(countOf),
  ])
  return {
    processDefinitionKey: options.processDefinitionKey,
    activityId: options.activityId,
    incidents: raw.map((r) => toIncidentInstance(r, options)),
    totalCount,
  }
}
