import type { Client } from "@miragon-ai/camunda7-client"
import {
  getHistoricProcessInstancesCount,
  getIncidents,
  getIncidentsCount,
  getProcessDefinitionStatistics,
  getProcessInstances,
} from "@miragon-ai/camunda7-client/sdk"
import type {
  ClusterDetailData,
  ClusterIncidentRow,
  EngineHealthCluster,
  EngineHealthData,
  EngineHealthStatus,
} from "../view-models.js"
import type { ClusterDetailFilters, PagingArgs } from "../feed-contracts.js"
import { processDefinitionKeyFromId } from "./incident-panel-data.js"

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * Deterministic thresholds for the traffic-light verdict. Named and
 * deployment-tunable (via the plugin config / `CAMUNDA_HEALTH_*` env vars) so
 * the verdict is explainable per installation — the AI judgment lives in the
 * "ask the AI" handoff, not in these numbers.
 */
export interface EngineHealthThresholds {
  /** Total open incidents at or above which the verdict turns "critical". */
  criticalIncidents: number
  /** Single-cluster size at or above which the verdict turns "critical". */
  criticalClusterSize: number
}

export const DEFAULT_HEALTH_THRESHOLDS: EngineHealthThresholds = {
  criticalIncidents: 50,
  criticalClusterSize: 25,
}

/** How many incident clusters the overview surfaces (the long tail is one click away). */
const MAX_CLUSTERS = 6
/** Cap the incident scan so the feed stays cheap on a busy engine. */
const INCIDENT_SCAN_LIMIT = 2000

const UNKNOWN = "(unknown)"

interface IncidentLike {
  id?: string | null
  processDefinitionId?: string | null
  processInstanceId?: string | null
  incidentType?: string | null
  activityId?: string | null
  incidentMessage?: string | null
  incidentTimestamp?: string | null
}

interface ClusterAcc {
  activityId: string
  incidentType: string
  signature: string
  count: number
  last24h: number
  /** processDefinitionKey -> incident count, to rank affected definitions. */
  keys: Map<string, number>
  sampleMessage: string | null
  sampleIncidentId: string
  latest: string | null
}

function statusOf(
  totalIncidents: number,
  topClusterSize: number,
  t: EngineHealthThresholds,
): EngineHealthStatus {
  if (totalIncidents >= t.criticalIncidents || topClusterSize >= t.criticalClusterSize) {
    return "critical"
  }
  return totalIncidents > 0 ? "degraded" : "ok"
}

/**
 * One-line truncation for cluster sample messages — engine exception messages
 * can be stacktrace-sized, and the sample travels into the widget render, the
 * data feed, and the "Fix" AI prompt.
 */
function truncateMessage(s: string | null, max = 300): string | null {
  if (!s) return null
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * Failure-message signature for clustering: the same activity failing with the
 * same incident type but a DIFFERENT exception (e.g. a timeout vs. an NPE on
 * `callWMS`) is a different root cause and must form its own cluster. Volatile
 * tokens (ids, numbers, quoted values) are masked so instance-specific noise
 * doesn't split one cause into hundreds of clusters.
 */
function messageSignature(msg: string | null): string {
  if (!msg) return ""
  return msg
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/g, "<id>")
    .replace(/'[^']*'/g, "'<v>'")
    .replace(/"[^"]*"/g, '"<v>"')
    .replace(/\b\d+\b/g, "<n>")
    .trim()
    .slice(0, 160)
}

interface IncidentScanAgg {
  byCluster: Map<string, ClusterAcc>
  activitySet: Set<string>
  defSet: Set<string>
  last24hIncidents: number
  lastHourIncidents: number
}

interface IncidentFacts {
  activityId: string
  incidentType: string
  signature: string
  /** Cluster by activity + type + failure-message signature: same activity,
   * same type, different exception = different root cause = its own cluster. */
  clusterKey: string
  defKey: string
  ts: string
  isRecent: boolean
  isLastHour: boolean
}

/**
 * Recency compares epoch millis, not strings: the engine emits timestamps with
 * its local UTC offset (e.g. `…+0200`), which do not order lexicographically
 * against a Zulu `toISOString()` cutoff.
 */
function deriveIncidentFacts(
  inc: IncidentLike,
  cutoffMs: number,
  hourCutoffMs: number,
): IncidentFacts {
  const activityId = inc.activityId ?? UNKNOWN
  const incidentType = inc.incidentType ?? "unknown"
  const signature = messageSignature(inc.incidentMessage ?? null)
  const defKey = inc.processDefinitionId
    ? processDefinitionKeyFromId(inc.processDefinitionId)
    : UNKNOWN
  const ts = inc.incidentTimestamp ?? ""
  const tsMs = ts === "" ? Number.NaN : Date.parse(ts)
  return {
    activityId,
    incidentType,
    signature,
    clusterKey: `${activityId}::${incidentType}::${signature}`,
    defKey,
    ts,
    isRecent: Number.isFinite(tsMs) && tsMs >= cutoffMs,
    isLastHour: Number.isFinite(tsMs) && tsMs >= hourCutoffMs,
  }
}

/** One pass over the incident scan: cluster by root-cause key and count the recency windows. */
function clusterIncidents(incidents: IncidentLike[], nowMs: number): IncidentScanAgg {
  const cutoffMs = nowMs - DAY_MS
  const hourCutoffMs = nowMs - HOUR_MS
  const byCluster = new Map<string, ClusterAcc>()
  const activitySet = new Set<string>()
  const defSet = new Set<string>()
  let last24hIncidents = 0
  let lastHourIncidents = 0

  for (const inc of incidents) {
    const facts = deriveIncidentFacts(inc, cutoffMs, hourCutoffMs)
    activitySet.add(facts.activityId)
    defSet.add(facts.defKey)
    if (facts.isRecent) last24hIncidents += 1
    if (facts.isLastHour) lastHourIncidents += 1

    const acc =
      byCluster.get(facts.clusterKey) ??
      ({
        activityId: facts.activityId,
        incidentType: facts.incidentType,
        signature: facts.signature,
        count: 0,
        last24h: 0,
        keys: new Map<string, number>(),
        sampleMessage: truncateMessage(inc.incidentMessage ?? null),
        sampleIncidentId: inc.id ?? "",
        latest: null,
      } satisfies ClusterAcc)

    acc.count += 1
    if (facts.isRecent) acc.last24h += 1
    acc.keys.set(facts.defKey, (acc.keys.get(facts.defKey) ?? 0) + 1)
    if (facts.ts !== "" && (acc.latest === null || facts.ts > acc.latest)) acc.latest = facts.ts
    byCluster.set(facts.clusterKey, acc)
  }

  return { byCluster, activitySet, defSet, last24hIncidents, lastHourIncidents }
}

function toClusterList(byCluster: Map<string, ClusterAcc>): EngineHealthCluster[] {
  return [...byCluster.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_CLUSTERS)
    .map(([key, c]) => ({
      id: key,
      activityId: c.activityId,
      incidentType: c.incidentType,
      messageSignature: c.signature,
      incidentCount: c.count,
      last24hCount: c.last24h,
      processDefinitionKeys: [...c.keys.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
      representativeMessage: c.sampleMessage,
      representativeIncidentId: c.sampleIncidentId,
      latestIncident: c.latest,
    }))
}

function healthHeadline(
  status: EngineHealthData["status"],
  totalIncidents: number,
  runningInstances: number,
  affectedActivities: number,
): string {
  if (totalIncidents === 0) {
    return `Stable — no open incidents (${runningInstances} running instances)`
  }
  const statusLabel = status === "ok" ? "Stable" : status === "degraded" ? "Degraded" : "Critical"
  return (
    `${statusLabel} — ${totalIncidents} open incident${totalIncidents === 1 ? "" : "s"} ` +
    `across ${affectedActivities} ${affectedActivities === 1 ? "activity" : "activities"}`
  )
}

/**
 * Engine-wide health verdict for the AI-first cockpit overview. Purely
 * deterministic: it counts running instances + open incidents, then clusters
 * incidents cross-process by `(activityId, incidentType)` — the root-cause unit
 * a support operator acts on. No LLM runs here; the widget hands each cluster to
 * the host agent on demand for the plain-language cause + remediation.
 */
export async function buildEngineHealthData(
  client: Client,
  engineId: string,
  thresholds: EngineHealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): Promise<EngineHealthData> {
  // The engine emits/accepts `yyyy-MM-dd'T'HH:mm:ss.SSS±HHMM` — a literal "Z"
  // suffix is not part of that contract, so rewrite it for the history filters.
  const dayAgoParam = new Date(Date.now() - DAY_MS).toISOString().replace("Z", "+0000")

  // Deliberately NO .catch(() => []) on the verdict inputs: a down or
  // unauthorized engine must surface as a tool error (via the withToolErrors
  // wrapper), never as a confident "Stable — no open incidents" verdict. The
  // two throughput counts are OPTIONAL enrichment — history can be disabled
  // (history level "none") on an otherwise healthy engine, so they degrade to
  // null instead of failing the whole verdict.
  const [incidentsRaw, countRes, statsRaw, startedRes, completedRes] = await Promise.all([
    getIncidents({
      client,
      query: { maxResults: INCIDENT_SCAN_LIMIT, sortBy: "incidentTimestamp", sortOrder: "desc" },
    }),
    getIncidentsCount({ client, query: {} }),
    getProcessDefinitionStatistics({ client, query: { incidents: true } }),
    getHistoricProcessInstancesCount({ client, query: { startedAfter: dayAgoParam } }).catch(
      () => null,
    ),
    getHistoricProcessInstancesCount({ client, query: { finishedAfter: dayAgoParam } }).catch(
      () => null,
    ),
  ])

  const incidents = (Array.isArray(incidentsRaw) ? incidentsRaw : []) as IncidentLike[]
  const nowMs = Date.now()

  // Totals from definition statistics: one call gives running instances + the
  // deployed-definition count without a second round-trip.
  const statRows = (Array.isArray(statsRaw) ? statsRaw : []) as Array<{
    instances?: number | null
    definition?: { key?: string | null } | null
  }>
  const runningInstances = statRows.reduce((sum, r) => sum + (r.instances ?? 0), 0)
  const totalDefinitions = new Set(
    statRows.map((r) => r.definition?.key).filter((k): k is string => !!k),
  ).size

  const { byCluster, activitySet, defSet, last24hIncidents, lastHourIncidents } = clusterIncidents(
    incidents,
    nowMs,
  )
  const clusters = toClusterList(byCluster)

  // True engine-wide total from /incident/count — the scan above is capped at
  // INCIDENT_SCAN_LIMIT, so on a busy engine `incidents.length` would silently
  // understate the verdict (and contradict the statistics-derived totals shown
  // alongside). Clusters + the 24h count still come from the most-recent scan.
  const totalIncidents = (countRes as { count?: number } | null)?.count ?? incidents.length
  const status = statusOf(totalIncidents, clusters[0]?.incidentCount ?? 0, thresholds)
  const headline = healthHeadline(status, totalIncidents, runningInstances, activitySet.size)

  return {
    status,
    headline,
    summary: {
      totalIncidents,
      lastHourIncidents,
      last24hIncidents,
      affectedActivities: activitySet.size,
      affectedDefinitions: defSet.size,
      runningInstances,
      totalDefinitions,
      started24h: startedRes?.count ?? null,
      completed24h: completedRes?.count ?? null,
    },
    clusters,
    fetchedAt: new Date(nowMs).toISOString(),
    engineId,
  }
}

/** How many affected incidents the cluster detail lists (the rest is counted). */
const CLUSTER_DETAIL_ROWS = 50

/**
 * Filters from the shared feed contract + paging. `businessKeyLike`: the
 * `/incident` API has no business-key filter, so the builder resolves matching
 * instance ids via `/process-instance?businessKeyLike=` and intersects with
 * the cluster set — the KPIs keep describing the WHOLE cluster, only the list
 * narrows. `maxResults` defaults to {@link CLUSTER_DETAIL_ROWS}.
 */
export type ClusterDetailArgs = ClusterDetailFilters & PagingArgs

/**
 * Drill-in for ONE failure cluster: server-side filter by activity + incident
 * type, client-side by the same message signature the overview clustered with,
 * then enrich the affected instances with their business keys — the operator's
 * "order number", not an engine UUID.
 */
export async function buildClusterDetailData(
  client: Client,
  engineId: string,
  args: ClusterDetailArgs,
): Promise<ClusterDetailData> {
  // Primary fetch — failures must propagate as tool errors (no silent []).
  // The business-key search resolves independently: matching instance ids come
  // from /process-instance (the incident API has no business-key filter).
  const [incidentsRaw, searchHitsRaw] = await Promise.all([
    getIncidents({
      client,
      query: {
        activityId: args.activityId,
        incidentType: args.incidentType,
        maxResults: INCIDENT_SCAN_LIMIT,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
      },
    }),
    args.businessKeyLike
      ? getProcessInstances({
          client,
          query: { businessKeyLike: args.businessKeyLike, maxResults: INCIDENT_SCAN_LIMIT },
        })
      : Promise.resolve(null),
  ])

  const all = (Array.isArray(incidentsRaw) ? incidentsRaw : []) as IncidentLike[]
  const matching =
    args.messageSignature === undefined
      ? all
      : all.filter((i) => messageSignature(i.incidentMessage ?? null) === args.messageSignature)

  const listed = filterToSearchHits(matching, searchHitsRaw)

  const nowMs = Date.now()
  const kpis = aggregateClusterKpis(matching, nowMs)

  // Paging slices the in-memory listed set (not an engine-side offset): the
  // messageSignature/business-key filters are resolved here and the KPIs above
  // need the full set anyway, so an offset re-query would change semantics
  // without saving the scan. Bounded by INCIDENT_SCAN_LIMIT like everything
  // else here.
  const first = Math.max(0, args.firstResult ?? 0)
  const pageSize = args.maxResults ?? CLUSTER_DETAIL_ROWS
  const page = listed.slice(first, first + pageSize)

  const businessKeyById = await resolveBusinessKeys(client, page)

  const incidents: ClusterIncidentRow[] = page.map((i) => ({
    incidentId: i.id ?? "",
    processInstanceId: i.processInstanceId ?? "",
    businessKey: i.processInstanceId ? (businessKeyById.get(i.processInstanceId) ?? null) : null,
    processDefinitionKey: i.processDefinitionId
      ? processDefinitionKeyFromId(i.processDefinitionId)
      : UNKNOWN,
    incidentTimestamp: i.incidentTimestamp ?? "",
  }))

  return {
    activityId: args.activityId,
    incidentType: args.incidentType,
    messageSignature: args.messageSignature ?? null,
    incidentCount: matching.length,
    lastHourCount: kpis.lastHourCount,
    last24hCount: kpis.last24hCount,
    firstSeen: kpis.firstSeen,
    latestIncident: kpis.latestIncident,
    processDefinitionKeys: [...kpis.defCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k),
    representativeMessage: truncateMessage(matching[0]?.incidentMessage ?? null, 600),
    incidents,
    totalMatching: listed.length,
    fetchedAt: new Date(nowMs).toISOString(),
    engineId,
  }
}

/** Search narrows the LIST (and its total), never the cluster KPIs. */
function filterToSearchHits(matching: IncidentLike[], searchHitsRaw: unknown): IncidentLike[] {
  if (searchHitsRaw === null) return matching
  const hitIds = new Set(
    ((Array.isArray(searchHitsRaw) ? searchHitsRaw : []) as Array<{ id?: string | null }>)
      .map((i) => i.id)
      .filter((id): id is string => !!id),
  )
  return matching.filter((i) => i.processInstanceId && hitIds.has(i.processInstanceId))
}

interface ClusterKpis {
  lastHourCount: number
  last24hCount: number
  firstSeen: string | null
  latestIncident: string | null
  defCounts: Map<string, number>
}

function aggregateClusterKpis(matching: IncidentLike[], nowMs: number): ClusterKpis {
  const hourCutoffMs = nowMs - HOUR_MS
  const dayCutoffMs = nowMs - DAY_MS
  let lastHourCount = 0
  let last24hCount = 0
  let firstSeen: string | null = null
  let latestIncident: string | null = null
  const defCounts = new Map<string, number>()

  for (const inc of matching) {
    const ts = inc.incidentTimestamp ?? ""
    const tsMs = ts === "" ? Number.NaN : Date.parse(ts)
    if (Number.isFinite(tsMs) && tsMs >= hourCutoffMs) lastHourCount += 1
    if (Number.isFinite(tsMs) && tsMs >= dayCutoffMs) last24hCount += 1
    if (ts !== "") {
      if (firstSeen === null || ts < firstSeen) firstSeen = ts
      if (latestIncident === null || ts > latestIncident) latestIncident = ts
    }
    const defKey = inc.processDefinitionId
      ? processDefinitionKeyFromId(inc.processDefinitionId)
      : UNKNOWN
    defCounts.set(defKey, (defCounts.get(defKey) ?? 0) + 1)
  }

  return { lastHourCount, last24hCount, firstSeen, latestIncident, defCounts }
}

/**
 * Business-key enrichment is best-effort: a failed lookup degrades to "—"
 * keys, it must not turn a working cluster view into a tool error.
 */
async function resolveBusinessKeys(
  client: Client,
  page: IncidentLike[],
): Promise<Map<string, string | null>> {
  const instanceIds = [
    ...new Set(page.map((i) => i.processInstanceId).filter((x): x is string => !!x)),
  ]
  const instancesRaw =
    instanceIds.length > 0
      ? await getProcessInstances({
          client,
          query: { processInstanceIds: instanceIds.join(","), maxResults: instanceIds.length },
        }).catch(() => [])
      : []
  return new Map(
    (
      (Array.isArray(instancesRaw) ? instancesRaw : []) as Array<{
        id?: string | null
        businessKey?: string | null
      }>
    )
      .filter((i): i is { id: string; businessKey: string | null } => !!i.id)
      .map((i) => [i.id, i.businessKey ?? null]),
  )
}
