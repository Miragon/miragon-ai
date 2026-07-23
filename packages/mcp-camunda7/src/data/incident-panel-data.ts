import type { Client } from "@miragon-ai/client-camunda7"
import type {
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
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-camunda7/sdk"

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
  const { byKey, rows } = await fetchIncidents(client, options)
  const definitionInfo = await fetchDefinitionInfo(client, [...byKey.keys()])

  const cutoffMs = Date.now() - DAY_MS
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
    totalCount: rows.length,
    processCount: processes.length,
    affectedActivityCount: affectedActivityTotal,
    last24hCount: last24hTotal,
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
  const { byKey } = await fetchIncidents(client, {
    processDefinitionKey: options.processDefinitionKey,
  })

  const group = byKey.get(options.processDefinitionKey) ?? []
  const definitionInfo = await fetchDefinitionInfo(client, [options.processDefinitionKey])
  const def = definitionInfo.get(options.processDefinitionKey)?.info ?? null
  const runningInstances = definitionInfo.get(options.processDefinitionKey)?.instances ?? null

  const processDefinitionId = def?.id || group[0]?.processDefinitionId || null

  const [xmlResponse, failedJobs] = await Promise.all([
    processDefinitionId
      ? (getProcessDefinitionBpmn20Xml({
          client,
          path: { id: processDefinitionId },
        }).catch(() => null) as Promise<{ bpmn20Xml?: string } | null>)
      : Promise.resolve(null),
    processDefinitionId ? fetchFailedJobCount(client, processDefinitionId) : Promise.resolve(null),
  ])
  const bpmnXml = xmlResponse?.bpmn20Xml ?? null

  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}
  const totalActivityCount = bpmnXml ? countBpmnActivities(bpmnXml) : null

  const cutoffMs = Date.now() - DAY_MS

  const incidentCtx: IncidentInstanceContext = {
    cockpitUrl: options.cockpitUrl,
    baseUrl: options.baseUrl,
    provider: options.provider,
    processDefinitionKey: options.processDefinitionKey,
    version: def?.version ?? null,
    definitionId: def?.id ?? null,
    tab: "incidents",
  }

  const byActivity = new Map<string, IncidentInstance[]>()
  for (const r of group) {
    const list = byActivity.get(r.activityId) ?? []
    list.push(toIncidentInstance(r, incidentCtx))
    byActivity.set(r.activityId, list)
  }

  const activities: ProcessIncidentsActivity[] = [...byActivity.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([activityId, incidents]) => ({
      activityId,
      activityName: activityNames[activityId] ?? null,
      representativeMessage: incidents[0].incidentMessage,
      incidentCount: incidents.length,
      firstSeen: minTimestamp(incidents.map((i) => i.incidentTimestamp)),
      latestIncident: maxTimestamp(incidents.map((i) => i.incidentTimestamp)),
      incidents,
    }))

  // When the requested process has no open incidents, fetch the cluster-wide
  // incident set so the empty state can offer to jump to a process that does.
  const siblingsWithIncidents: IncidentsByProcess[] =
    group.length === 0 ? await fetchSiblingsWithIncidents(client, options.processDefinitionKey) : []

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
    incidentCount: group.length,
    last24hCount: group.filter((r) => isOnOrAfter(r.incidentTimestamp, cutoffMs)).length,
    failedJobs,
    totalActivityCount,
    latestIncident: maxTimestamp(group.map((r) => r.incidentTimestamp)),
    activities,
    siblingsWithIncidents,
  }
}

/**
 * Failed-job count (no retries left) summed over the definition's activity
 * statistics — the KPI the merged definition view surfaces next to the
 * incident counts. Null (not 0) when the statistics call fails so the widget
 * can render "unknown" instead of a false all-clear.
 */
async function fetchFailedJobCount(
  client: Client,
  processDefinitionId: string,
): Promise<number | null> {
  const stats = (await getActivityStatistics({
    client,
    path: { id: processDefinitionId },
    query: { failedJobs: true },
  }).catch(() => null)) as Array<{ failedJobs?: number | null }> | null
  if (!Array.isArray(stats)) return null
  return stats.reduce((sum, row) => sum + (row.failedJobs ?? 0), 0)
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
