import {
  earliestEngineDate,
  engineDateMillis,
  engineLike,
  latestEngineDate,
  toEngineDate,
  type Client,
} from "@miragon-ai/camunda7-client"
import {
  getHistoricProcessInstancesCount,
  getIncidents,
  getIncidentsCount,
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
import { fetchStatsByKey, processDefinitionKeyFromId } from "./definition-info.js"
import { countOf, rowsOf } from "./engine-reads.js"

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

/**
 * The verdict rule in words — stated in the tool description and carried in
 * every payload (`statusRule`), so no reader mistakes this incident-count
 * verdict for analytics_engine_health's alert-based one: the two judge
 * different data by different rules and may disagree for the same engine.
 */
export function healthVerdictRule(t: EngineHealthThresholds): string {
  return (
    `From the engine's open incidents, read live: critical at >=${t.criticalIncidents} open ` +
    `or >=${t.criticalClusterSize} in one cluster, degraded with any, else ok.`
  )
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
}

/**
 * Recency and ordering compare instants, never strings: the engine emits
 * timestamps with its local UTC offset (e.g. `…+0200`), which neither order
 * against a Zulu cutoff nor against each other across a DST change
 * (`engineDateMillis` / `latestEngineDate`, the engine contract's read side).
 */
function deriveIncidentFacts(inc: IncidentLike, cutoffMs: number): IncidentFacts {
  const activityId = inc.activityId ?? UNKNOWN
  const incidentType = inc.incidentType ?? "unknown"
  const signature = messageSignature(inc.incidentMessage ?? null)
  const defKey = inc.processDefinitionId
    ? processDefinitionKeyFromId(inc.processDefinitionId)
    : UNKNOWN
  const ts = inc.incidentTimestamp ?? ""
  const tsMs = engineDateMillis(ts)
  return {
    activityId,
    incidentType,
    signature,
    clusterKey: `${activityId}::${incidentType}::${signature}`,
    defKey,
    ts,
    isRecent: tsMs !== null && tsMs >= cutoffMs,
  }
}

/** One pass over the incident scan: cluster by root-cause key, collect the affected activities. */
function clusterIncidents(incidents: IncidentLike[], nowMs: number): IncidentScanAgg {
  const cutoffMs = nowMs - DAY_MS
  const byCluster = new Map<string, ClusterAcc>()
  const activitySet = new Set<string>()

  for (const inc of incidents) {
    const facts = deriveIncidentFacts(inc, cutoffMs)
    activitySet.add(facts.activityId)

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
    acc.latest = latestEngineDate([acc.latest, facts.ts])
    byCluster.set(facts.clusterKey, acc)
  }

  return { byCluster, activitySet }
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
  affectedActivities: number | null,
): string {
  if (totalIncidents === 0) {
    return `Stable — no open incidents (${runningInstances} running instances)`
  }
  const statusLabel = status === "ok" ? "Stable" : status === "degraded" ? "Degraded" : "Critical"
  const incidents = `${totalIncidents} open incident${totalIncidents === 1 ? "" : "s"}`
  if (affectedActivities === null) return `${statusLabel} — ${incidents}`
  return (
    `${statusLabel} — ${incidents} ` +
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
  // History filters take the engine's date format (engine contract).
  const startMs = Date.now()
  const dayAgoParam = toEngineDate(new Date(startMs - DAY_MS))
  const hourAgoParam = toEngineDate(new Date(startMs - HOUR_MS))

  // Deliberately NO .catch(() => []) on the verdict inputs: a down or
  // unauthorized engine must surface as a tool error (via the withToolErrors
  // wrapper), never as a confident "Stable — no open incidents" verdict. The
  // two throughput counts are OPTIONAL enrichment — history can be disabled
  // (history level "none") on an otherwise healthy engine, so they degrade to
  // null instead of failing the whole verdict. Every total is a `/count` or
  // the statistics — the capped scan only feeds the clusters.
  const count = (query: { incidentTimestampAfter?: string }) =>
    getIncidentsCount({ client, query }).then(countOf)
  const [
    incidents,
    totalIncidents,
    lastHourIncidents,
    last24hIncidents,
    statsByKey,
    startedRes,
    completedRes,
  ] = await Promise.all([
    getIncidents({
      client,
      query: { maxResults: INCIDENT_SCAN_LIMIT, sortBy: "incidentTimestamp", sortOrder: "desc" },
    }).then((rows) => rowsOf<IncidentLike>(rows)),
    count({}),
    count({ incidentTimestampAfter: hourAgoParam }),
    count({ incidentTimestampAfter: dayAgoParam }),
    fetchStatsByKey(client, {}),
    getHistoricProcessInstancesCount({ client, query: { startedAfter: dayAgoParam } }).catch(
      () => null,
    ),
    getHistoricProcessInstancesCount({ client, query: { finishedAfter: dayAgoParam } }).catch(
      () => null,
    ),
  ])

  const nowMs = Date.now()

  // Per-KEY definition statistics: running instances over every version, the
  // deployed keys, and the keys carrying incidents — exact, unlike the scan.
  const keyStats = [...statsByKey.values()]
  const runningInstances = keyStats.reduce((sum, k) => sum + k.instances, 0)
  const affectedDefinitions = keyStats.filter((k) => k.incidentCount > 0).length

  const { byCluster, activitySet } = clusterIncidents(incidents, nowMs)
  const clusters = toClusterList(byCluster)
  // The affected activities are exact only when the scan read every incident.
  const affectedActivities = incidents.length < INCIDENT_SCAN_LIMIT ? activitySet.size : null

  const status = statusOf(totalIncidents, clusters[0]?.incidentCount ?? 0, thresholds)
  const headline = healthHeadline(status, totalIncidents, runningInstances, affectedActivities)

  return {
    status,
    statusRule: healthVerdictRule(thresholds),
    headline,
    summary: {
      totalIncidents,
      lastHourIncidents,
      last24hIncidents,
      affectedActivities,
      affectedDefinitions,
      runningInstances,
      totalDefinitions: statsByKey.size,
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
    }).then((rows) => rowsOf<IncidentLike>(rows)),
    args.businessKeyLike
      ? getProcessInstances({
          client,
          query: {
            businessKeyLike: engineLike(args.businessKeyLike),
            maxResults: INCIDENT_SCAN_LIMIT,
          },
        }).then((rows) => rowsOf<{ id?: string | null }>(rows))
      : Promise.resolve(null),
  ])

  const all = incidentsRaw
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
function filterToSearchHits(
  matching: IncidentLike[],
  searchHits: Array<{ id?: string | null }> | null,
): IncidentLike[] {
  if (searchHits === null) return matching
  const hitIds = new Set(searchHits.map((i) => i.id).filter((id): id is string => !!id))
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
  const defCounts = new Map<string, number>()

  for (const inc of matching) {
    const tsMs = engineDateMillis(inc.incidentTimestamp)
    if (tsMs !== null && tsMs >= hourCutoffMs) lastHourCount += 1
    if (tsMs !== null && tsMs >= dayCutoffMs) last24hCount += 1
    const defKey = inc.processDefinitionId
      ? processDefinitionKeyFromId(inc.processDefinitionId)
      : UNKNOWN
    defCounts.set(defKey, (defCounts.get(defKey) ?? 0) + 1)
  }

  const timestamps = matching.map((inc) => inc.incidentTimestamp)
  return {
    lastHourCount,
    last24hCount,
    firstSeen: earliestEngineDate(timestamps),
    latestIncident: latestEngineDate(timestamps),
    defCounts,
  }
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
