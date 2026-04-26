import type {
  Client,
  IncidentInstance,
  IncidentsByProcess,
  IncidentsDashboardActivity,
  IncidentsDashboardData,
  IncidentsDashboardProcess,
  ProcessIncidentsActivity,
  ProcessIncidentsData,
} from "@miragon-ai/client-cibseven"
import {
  getIncidents,
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
  getProcessDefinitionStatistics,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"

import { buildInstanceCockpitUrlPrefix, buildProcessCockpitUrl } from "./lib/cockpit-url.js"
import { countBpmnActivities, extractActivityNames } from "./lib/bpmn-parse.js"

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

interface DefinitionInfo {
  id: string
  key: string
  name: string | null
  version: number | null
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

async function fetchDefinitionInfo(
  client: Client,
  keys: string[],
): Promise<Map<string, { info: DefinitionInfo; instances: number | null }>> {
  if (keys.length === 0) return new Map()

  // Cluster-wide statistics: gives running instances + name/version per definition in a single call.
  const stats = (await getProcessDefinitionStatistics({
    client,
    query: {},
  }).catch(() => [])) as unknown as DefinitionStatsRow[]

  const wantedKeys = new Set(keys)
  const byKey = new Map<string, { info: DefinitionInfo; instances: number | null }>()
  for (const row of Array.isArray(stats) ? stats : []) {
    const def = row.definition
    if (!def?.key || !wantedKeys.has(def.key)) continue
    const existing = byKey.get(def.key)
    const candidate: DefinitionInfo = {
      id: def.id ?? "",
      key: def.key,
      name: def.name ?? null,
      version: typeof def.version === "number" ? def.version : null,
    }
    // Prefer the latest version for the same key.
    if (
      !existing ||
      (candidate.version !== null &&
        (existing.info.version === null || candidate.version > existing.info.version))
    ) {
      byKey.set(def.key, { info: candidate, instances: row.instances ?? null })
    }
  }

  // Fallback for keys not in stats (e.g. all instances ended) — fetch via /process-definition.
  const missing = keys.filter((k) => !byKey.has(k))
  if (missing.length > 0) {
    const defs = (await getProcessDefinitions({
      client,
      query: {
        keysIn: missing.join(","),
        latestVersion: true,
      },
    }).catch(() => [])) as unknown as Array<{
      id?: string
      key?: string
      name?: string | null
      version?: number
    }>
    for (const d of Array.isArray(defs) ? defs : []) {
      if (!d.key) continue
      byKey.set(d.key, {
        info: {
          id: d.id ?? "",
          key: d.key,
          name: d.name ?? null,
          version: typeof d.version === "number" ? d.version : null,
        },
        instances: 0,
      })
    }
  }

  return byKey
}

function toIncidentInstance(r: IncidentRow): IncidentInstance {
  return {
    id: r.id,
    processInstanceId: r.processInstanceId,
    incidentType: r.incidentType,
    incidentMessage: r.incidentMessage ?? null,
    incidentTimestamp: r.incidentTimestamp,
  }
}

function maxTimestamp(values: string[]): string | null {
  if (values.length === 0) return null
  return values.reduce((max, v) => (v > max ? v : max), values[0])
}

function minTimestamp(values: string[]): string | null {
  if (values.length === 0) return null
  return values.reduce((min, v) => (v < min ? v : min), values[0])
}

interface BuildOverviewOptions {
  baseUrl: string
  cockpitUrl?: string
  processDefinitionKey?: string
  incidentType?: string
}

export async function buildIncidentsDashboardData(
  client: Client,
  options: BuildOverviewOptions,
): Promise<IncidentsDashboardData> {
  const { byKey, rows } = await fetchIncidents(client, options)
  const definitionInfo = await fetchDefinitionInfo(client, [...byKey.keys()])

  const cutoff = new Date(Date.now() - DAY_MS).toISOString()
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
        last24hCount: incidents.filter((i) => i.incidentTimestamp >= cutoff).length,
        firstSeen: minTimestamp(incidents.map((i) => i.incidentTimestamp)),
        latestIncident: maxTimestamp(incidents.map((i) => i.incidentTimestamp)),
      }))

    const last24hCount = group.filter((r) => r.incidentTimestamp >= cutoff).length
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
      cockpitUrl: buildProcessCockpitUrl(options.cockpitUrl, options.baseUrl, key, {
        tab: "incidents",
      }),
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

  const xmlResponse = processDefinitionId
    ? ((await getProcessDefinitionBpmn20Xml({
        client,
        path: { id: processDefinitionId },
      }).catch(() => null)) as { bpmn20Xml?: string } | null)
    : null
  const bpmnXml = xmlResponse?.bpmn20Xml ?? null

  const activityNames = bpmnXml ? extractActivityNames(bpmnXml) : {}
  const totalActivityCount = bpmnXml ? countBpmnActivities(bpmnXml) : null

  const cutoff = new Date(Date.now() - DAY_MS).toISOString()

  const byActivity = new Map<string, IncidentInstance[]>()
  for (const r of group) {
    const list = byActivity.get(r.activityId) ?? []
    list.push(toIncidentInstance(r))
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
      options.cockpitUrl,
      options.baseUrl,
      options.processDefinitionKey,
      { tab: "incidents" },
    ),
    cockpitInstanceUrlPrefix: buildInstanceCockpitUrlPrefix(options.cockpitUrl, options.baseUrl),
    runningInstances,
    incidentCount: group.length,
    last24hCount: group.filter((r) => r.incidentTimestamp >= cutoff).length,
    totalActivityCount,
    latestIncident: maxTimestamp(group.map((r) => r.incidentTimestamp)),
    activities,
    siblingsWithIncidents,
  }
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
