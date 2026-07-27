import type { Client } from "@miragon-ai/client-camunda7"
import type {
  ActivityIncidentsData,
  IncidentInstance,
  IncidentsByProcess,
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
  ProcessIncidentsActivity,
  ProcessIncidentsData,
} from "../view-models.js"
import {
  getActivityStatistics,
  getIncidents,
  getIncidentsCount,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-camunda7/sdk"

import type { ActivityIncidentsFilters, PagingArgs } from "../feed-contracts.js"
import { buildInstanceCockpitUrl, buildProcessCockpitUrl } from "../lib/cockpit-url.js"
import type { EngineProvider } from "../engine-provider.js"
import { countBpmnActivities, extractActivityNames } from "../lib/bpmn-parse.js"
import { fetchDefinitionInfo } from "./definition-info.js"

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

interface DefinitionStatsRow {
  id?: string | null
  instances?: number | null
  definition?: {
    id?: string | null
    key?: string | null
    name?: string | null
    version?: number | null
  } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

interface IncidentRowsAggregator {
  rows: IncidentRow[]
  byKey: Map<string, IncidentRow[]>
}

/**
 * Camunda 7 / CIB seven process definition IDs are formatted as
 * `<key>:<version>:<deploymentId>`. The `/incident` REST response carries the
 * id but **not** the key, so we parse it from the id. Falls back to the full
 * id if no `:` separator is present (treats the id itself as the key).
 */
export function processDefinitionKeyFromId(id: string): string {
  const idx = id.indexOf(":")
  return idx > 0 ? id.slice(0, idx) : id
}

async function fetchIncidents(
  client: Client,
  options: { processDefinitionKey?: string; incidentType?: string },
): Promise<IncidentRowsAggregator> {
  const raw = (await getIncidents({
    client,
    query: {
      processDefinitionKeyIn: options.processDefinitionKey,
      incidentType: options.incidentType,
      maxResults: 200,
      sortBy: "incidentTimestamp",
      sortOrder: "desc",
    },
  })) as unknown as Array<Omit<IncidentRow, "processDefinitionKey">>

  const rows: IncidentRow[] = raw.map((r) => ({
    ...r,
    processDefinitionKey: processDefinitionKeyFromId(r.processDefinitionId),
  }))

  const byKey = new Map<string, IncidentRow[]>()
  for (const row of rows) {
    const list = byKey.get(row.processDefinitionKey) ?? []
    list.push(row)
    byKey.set(row.processDefinitionKey, list)
  }

  return { rows, byKey }
}

interface IncidentInstanceContext {
  cockpitUrl: string | undefined
  baseUrl: string
  provider: EngineProvider
  processDefinitionKey: string
  version: number | null
  definitionId: string | null
  /** Cockpit tab to open on the instance page. Drill-in from an incident
   *  list defaults to `"incidents"` — operator is debugging failures. */
  tab: string
}

function toIncidentInstance(r: IncidentRow, ctx: IncidentInstanceContext): IncidentInstance {
  return {
    id: r.id,
    processInstanceId: r.processInstanceId,
    incidentType: r.incidentType,
    incidentMessage: r.incidentMessage ?? null,
    incidentTimestamp: r.incidentTimestamp,
    cockpitInstanceUrl: buildInstanceCockpitUrl(
      { baseUrl: ctx.baseUrl, cockpitUrl: ctx.cockpitUrl, provider: ctx.provider },
      {
        key: ctx.processDefinitionKey,
        version: ctx.version,
        definitionId: ctx.definitionId,
        instanceId: r.processInstanceId,
      },
      { tab: ctx.tab },
    ),
  }
}

/**
 * Compare epoch millis, not strings: the engine emits timestamps with its
 * local UTC offset (e.g. `…+0200`), which do not order lexicographically
 * against a Zulu `toISOString()` cutoff (same rule as health-data.ts).
 */
function isOnOrAfter(timestamp: string, cutoffMs: number): boolean {
  const ms = Date.parse(timestamp)
  return Number.isFinite(ms) && ms >= cutoffMs
}

/** Defensive read of a `/…/count` response — null when the call failed. */
function countFrom(res: unknown): number | null {
  const count = (res as { count?: unknown } | null)?.count
  return typeof count === "number" ? count : null
}

/**
 * The engine emits/accepts `yyyy-MM-dd'T'HH:mm:ss.SSS±HHMM` — a literal "Z"
 * suffix is not part of that contract (same rewrite as health-data.ts).
 */
function engineTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("Z", "+0000")
}

function maxTimestamp(values: string[]): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const v of values) {
    const ms = Date.parse(v)
    if (Number.isFinite(ms) && ms > bestMs) {
      best = v
      bestMs = ms
    }
  }
  return best
}

function minTimestamp(values: string[]): string | null {
  let best: string | null = null
  let bestMs = Infinity
  for (const v of values) {
    const ms = Date.parse(v)
    if (Number.isFinite(ms) && ms < bestMs) {
      best = v
      bestMs = ms
    }
  }
  return best
}

interface BuildOverviewOptions {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
  processDefinitionKey?: string
  incidentType?: string
}

export async function buildIncidentsDashboardData(
  client: Client,
  options: BuildOverviewOptions,
): Promise<IncidentsDashboardData> {
  const cutoffMs = Date.now() - DAY_MS
  // Honest engine-wide totals via /incident/count: the scan below is capped
  // at 200 rows, so its length silently undercounts a busy engine. Count
  // failures degrade to the scan-derived values instead of failing the feed.
  const countFilters = {
    processDefinitionKeyIn: options.processDefinitionKey,
    incidentType: options.incidentType,
  }
  const [{ byKey, rows }, totalRes, last24hRes] = await Promise.all([
    fetchIncidents(client, options),
    getIncidentsCount({ client, query: countFilters }).catch(() => null),
    getIncidentsCount({
      client,
      query: { ...countFilters, incidentTimestampAfter: engineTimestamp(cutoffMs) },
    }).catch(() => null),
  ])
  const definitionInfo = await fetchDefinitionInfo(client, [...byKey.keys()])
  let last24hTotal = 0
  let affectedActivityTotal = 0

  const sortedEntries = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)

  const processes: IncidentsDashboardProcess[] = sortedEntries.map(([key, group]) => {
    const def = definitionInfo.get(key)?.info ?? null
    const runningInstances = definitionInfo.get(key)?.instances ?? null

    const byActivity = new Map<string, IncidentRow[]>()
    for (const r of group) {
      const list = byActivity.get(r.activityId) ?? []
      list.push(r)
      byActivity.set(r.activityId, list)
    }

    const activities: IncidentsDashboardActivity[] = [...byActivity.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([activityId, incidents]) => ({
        activityId,
        // No BPMN fetch on overview — display names are looked up by the
        // detail view; here we show the activityId only.
        activityName: null,
        representativeMessage: incidents[0].incidentMessage,
        incidentCount: incidents.length,
        last24hCount: incidents.filter((i) => isOnOrAfter(i.incidentTimestamp, cutoffMs)).length,
        firstSeen: minTimestamp(incidents.map((i) => i.incidentTimestamp)),
        latestIncident: maxTimestamp(incidents.map((i) => i.incidentTimestamp)),
      }))

    const last24hCount = group.filter((r) => isOnOrAfter(r.incidentTimestamp, cutoffMs)).length
    last24hTotal += last24hCount
    affectedActivityTotal += activities.length

    return {
      processDefinitionKey: key,
      processDefinitionName: def?.name ?? null,
      version: def?.version ?? null,
      runningInstances,
      totalActivityCount: null, // overview has no BPMN — left null
      affectedActivityCount: activities.length,
      incidentCount: group.length,
      last24hCount,
      latestIncident: maxTimestamp(group.map((r) => r.incidentTimestamp)),
      cockpitUrl: buildProcessCockpitUrl(
        { baseUrl: options.baseUrl, cockpitUrl: options.cockpitUrl, provider: options.provider },
        { key, version: def?.version ?? null, definitionId: def?.id ?? null },
        { tab: "incidents" },
      ),
      activities,
    }
  })

  return {
    totalCount: countFrom(totalRes) ?? rows.length,
    processCount: processes.length,
    affectedActivityCount: affectedActivityTotal,
    last24hCount: countFrom(last24hRes) ?? last24hTotal,
    latestIncident: rows.length > 0 ? rows[0].incidentTimestamp : null,
    processes,
  }
}

interface BuildDetailOptions {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
  processDefinitionKey: string
}

export async function buildProcessIncidentsData(
  client: Client,
  options: BuildDetailOptions,
): Promise<ProcessIncidentsData> {
  const cutoffMs = Date.now() - DAY_MS
  const countFilters = { processDefinitionKeyIn: options.processDefinitionKey }
  const [{ byKey }, totalRes, last24hRes] = await Promise.all([
    fetchIncidents(client, { processDefinitionKey: options.processDefinitionKey }),
    // Honest per-definition totals via /incident/count — the recency scan is
    // capped at 200 rows; count failures degrade to the scan-derived values.
    getIncidentsCount({ client, query: countFilters }).catch(() => null),
    getIncidentsCount({
      client,
      query: { ...countFilters, incidentTimestampAfter: engineTimestamp(cutoffMs) },
    }).catch(() => null),
  ])

  const group = byKey.get(options.processDefinitionKey) ?? []
  const definitionInfo = await fetchDefinitionInfo(client, [options.processDefinitionKey])
  const def = definitionInfo.get(options.processDefinitionKey)?.info ?? null
  const runningInstances = definitionInfo.get(options.processDefinitionKey)?.instances ?? null

  const processDefinitionId = def?.id || group[0]?.processDefinitionId || null

  const [xmlResponse, activityStats] = await Promise.all([
    processDefinitionId
      ? (getProcessDefinitionBpmn20Xml({
          client,
          path: { id: processDefinitionId },
        }).catch(() => null) as Promise<{ bpmn20Xml?: string } | null>)
      : Promise.resolve(null),
    processDefinitionId
      ? fetchActivityStats(client, processDefinitionId)
      : Promise.resolve({ failedJobs: null, incidentCounts: null } satisfies ActivityStatsResult),
  ])
  const bpmnXml = xmlResponse?.bpmn20Xml ?? null

  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}
  const totalActivityCount = bpmnXml ? countBpmnActivities(bpmnXml) : null

  const byActivity = new Map<string, IncidentRow[]>()
  for (const r of group) {
    const list = byActivity.get(r.activityId) ?? []
    list.push(r)
    byActivity.set(r.activityId, list)
  }

  // Group axis: the recency scan UNION the exact activity statistics — an
  // activity whose incidents all lie beyond the 200-row scan still gets its
  // group (count from statistics; rows come from the paged per-activity feed).
  const activityIds = new Set<string>(byActivity.keys())
  for (const id of activityStats.incidentCounts?.keys() ?? []) activityIds.add(id)

  const activities: ProcessIncidentsActivity[] = [...activityIds]
    .map((activityId) => {
      const scanRows = byActivity.get(activityId) ?? []
      return {
        activityId,
        activityName: activityNames[activityId] ?? null,
        representativeMessage: scanRows[0]?.incidentMessage ?? null,
        // Statistics are exact; a scan-only activity (statistics outage or
        // race) falls back to its scanned row count.
        incidentCount: activityStats.incidentCounts?.get(activityId) ?? scanRows.length,
        firstSeen: minTimestamp(scanRows.map((i) => i.incidentTimestamp)),
        latestIncident: maxTimestamp(scanRows.map((i) => i.incidentTimestamp)),
      }
    })
    .sort((a, b) => b.incidentCount - a.incidentCount)

  const incidentCount = countFrom(totalRes) ?? group.length

  // When the requested process has no open incidents, fetch the cluster-wide
  // incident set so the empty state can offer to jump to a process that does.
  const siblingsWithIncidents: IncidentsByProcess[] =
    incidentCount === 0
      ? await fetchSiblingsWithIncidents(client, options.processDefinitionKey)
      : []

  return {
    processDefinitionKey: options.processDefinitionKey,
    processDefinitionName: def?.name ?? null,
    version: def?.version ?? null,
    bpmnXml,
    cockpitUrl: buildProcessCockpitUrl(
      { baseUrl: options.baseUrl, cockpitUrl: options.cockpitUrl, provider: options.provider },
      {
        key: options.processDefinitionKey,
        version: def?.version ?? null,
        definitionId: def?.id ?? null,
      },
      { tab: "incidents" },
    ),
    runningInstances,
    incidentCount,
    last24hCount:
      countFrom(last24hRes) ??
      group.filter((r) => isOnOrAfter(r.incidentTimestamp, cutoffMs)).length,
    failedJobs: activityStats.failedJobs,
    totalActivityCount,
    latestIncident: maxTimestamp(group.map((r) => r.incidentTimestamp)),
    activities,
    siblingsWithIncidents,
  }
}

/** Filters from the shared feed contract + paging (page size defaults to 10). */
export type ActivityIncidentsArgs = ActivityIncidentsFilters & PagingArgs

/** Server default page size of the per-activity incident feed. */
const ACTIVITY_INCIDENTS_PAGE = 10

/**
 * One page of an activity's incident rows — the paged feed behind each
 * expanded activity group of the definition view. Engine-side offset paging
 * (`/incident` supports firstResult/maxResults) with an exact total from
 * `/incident/count`, so the group's Load-more footer is honest beyond the
 * definition feed's 200-row recency scan.
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
  // Rows + count must propagate failures as tool errors (no silent []); the
  // definition lookup is display enrichment and may degrade.
  const [raw, countRes, definitionInfo] = await Promise.all([
    getIncidents({
      client,
      query: {
        ...query,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
        firstResult: Math.max(0, options.firstResult ?? 0),
        maxResults: options.maxResults ?? ACTIVITY_INCIDENTS_PAGE,
      },
    }),
    getIncidentsCount({ client, query }),
    fetchDefinitionInfo(client, [options.processDefinitionKey]),
  ])

  const def = definitionInfo.get(options.processDefinitionKey)?.info ?? null
  const incidentCtx: IncidentInstanceContext = {
    cockpitUrl: options.cockpitUrl,
    baseUrl: options.baseUrl,
    provider: options.provider,
    processDefinitionKey: options.processDefinitionKey,
    version: def?.version ?? null,
    definitionId: def?.id ?? null,
    tab: "incidents",
  }

  const rows = (Array.isArray(raw) ? raw : []) as Array<Omit<IncidentRow, "processDefinitionKey">>
  const incidents = rows.map((r) =>
    toIncidentInstance({ ...r, processDefinitionKey: options.processDefinitionKey }, incidentCtx),
  )

  return {
    processDefinitionKey: options.processDefinitionKey,
    activityId: options.activityId,
    incidents,
    totalCount: countFrom(countRes) ?? incidents.length,
  }
}

interface ActivityStatsResult {
  /** Failed jobs (no retries left) summed over all activities — null (not 0)
   *  when the statistics call fails so the widget renders "unknown". */
  failedJobs: number | null
  /** Exact open-incident count per activity id (only activities with > 0);
   *  null when the statistics call fails. */
  incidentCounts: Map<string, number> | null
}

/**
 * One activity-statistics call feeds two exact, scan-independent numbers of
 * the merged definition view: the failed-job KPI and the per-activity
 * incident counts shown on the group cards.
 */
async function fetchActivityStats(
  client: Client,
  processDefinitionId: string,
): Promise<ActivityStatsResult> {
  const stats = (await getActivityStatistics({
    client,
    path: { id: processDefinitionId },
    query: { failedJobs: true, incidents: true },
  }).catch(() => null)) as Array<{
    id?: string | null
    failedJobs?: number | null
    incidents?: Array<{ incidentCount?: number | null }> | null
  }> | null
  if (!Array.isArray(stats)) return { failedJobs: null, incidentCounts: null }

  let failedJobs = 0
  const incidentCounts = new Map<string, number>()
  for (const row of stats) {
    failedJobs += row.failedJobs ?? 0
    const count = Array.isArray(row.incidents)
      ? row.incidents.reduce((sum, i) => sum + (i.incidentCount ?? 0), 0)
      : 0
    if (row.id && count > 0) incidentCounts.set(row.id, count)
  }
  return { failedJobs, incidentCounts }
}

async function fetchSiblingsWithIncidents(
  client: Client,
  excludeKey: string,
): Promise<IncidentsByProcess[]> {
  // Use cluster-wide definition statistics to get an accurate per-key incident
  // count, independent of the 200-row default cap on `getIncidents`. The same
  // call also carries the human-readable definition name, so no second
  // round-trip is needed to enrich the result.
  const stats = (await getProcessDefinitionStatistics({
    client,
    query: { incidents: true },
  }).catch(() => [])) as unknown as DefinitionStatsRow[]

  const incidentsByKey = new Map<string, { count: number; name: string | null }>()
  for (const row of Array.isArray(stats) ? stats : []) {
    const key = row.definition?.key ?? null
    if (!key || key === excludeKey) continue
    const incidents = (row as { incidents?: Array<{ incidentCount?: number }> | null }).incidents
    const count = Array.isArray(incidents)
      ? incidents.reduce((s, i) => s + (i.incidentCount ?? 0), 0)
      : 0
    if (count <= 0) continue
    const existing = incidentsByKey.get(key)
    if (!existing || count > existing.count) {
      incidentsByKey.set(key, { count, name: row.definition?.name ?? null })
    }
  }

  return [...incidentsByKey.entries()]
    .map(([key, { count, name }]) => ({
      processDefinitionKey: key,
      processDefinitionName: name,
      incidentCount: count,
    }))
    .sort((a, b) => b.incidentCount - a.incidentCount)
}
