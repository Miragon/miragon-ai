import {
  engineDateMillis,
  latestEngineDate,
  toEngineDate,
  type Client,
} from "@miragon-ai/camunda7-client"
import {
  getHistoricProcessInstancesCount,
  getIncidents,
  getIncidentsCount,
} from "@miragon-ai/camunda7-client/sdk"
import type { EngineHealthCluster, EngineHealthData, EngineHealthStatus } from "../view-models.js"
import {
  CLUSTER_SCAN_LIMIT,
  HOUR_MS,
  messageSignature,
  scanCoverage,
  truncateMessage,
  UNKNOWN,
  type IncidentLike,
  type ScanCoverage,
} from "./cluster-scan.js"
import { definitionKeyResolver, fetchStatsByKey } from "./definition-info.js"
import { countOf, DAY_MS, rowsOf } from "./engine-reads.js"

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

interface ClusterAcc {
  activityId: string
  incidentType: string
  signature: string
  /** The cluster's incidents within the scan. */
  count: number
  /** The cluster's scanned incidents since now − 24h. */
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
function deriveIncidentFacts(
  inc: IncidentLike,
  cutoffMs: number,
  keyOf: (definitionId: string) => string | null,
): IncidentFacts {
  const activityId = inc.activityId ?? UNKNOWN
  const incidentType = inc.incidentType ?? "unknown"
  const signature = messageSignature(inc.incidentMessage ?? null)
  const defKey = (inc.processDefinitionId ? keyOf(inc.processDefinitionId) : null) ?? UNKNOWN
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
function clusterIncidents(
  incidents: IncidentLike[],
  cutoffMs: number,
  keyOf: (definitionId: string) => string | null,
): IncidentScanAgg {
  const byCluster = new Map<string, ClusterAcc>()
  const activitySet = new Set<string>()

  for (const inc of incidents) {
    const facts = deriveIncidentFacts(inc, cutoffMs, keyOf)
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

/**
 * The top clusters, ranked by their scanned share. Their counts are exact
 * only as far as the scan reaches: the total when it read every incident,
 * the 24h count when it reaches back past the cutoff — null otherwise.
 */
function toClusterList(
  byCluster: Map<string, ClusterAcc>,
  coverage: ScanCoverage,
  cutoffMs: number,
): EngineHealthCluster[] {
  return [...byCluster.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_CLUSTERS)
    .map(([key, c]) => ({
      id: key,
      activityId: c.activityId,
      incidentType: c.incidentType,
      messageSignature: c.signature,
      incidentCount: coverage.complete ? c.count : null,
      scannedIncidentCount: c.count,
      last24hCount: coverage.covers(cutoffMs) ? c.last24h : null,
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
      query: { maxResults: CLUSTER_SCAN_LIMIT, sortBy: "incidentTimestamp", sortOrder: "desc" },
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

  const cutoffMs = nowMs - DAY_MS
  const coverage = scanCoverage(incidents)
  // Rows join their key through the statistics — a bare generated definition
  // id (long keys) carries no parseable key.
  const { byCluster, activitySet } = clusterIncidents(
    incidents,
    cutoffMs,
    definitionKeyResolver(statsByKey),
  )
  const clusters = toClusterList(byCluster, coverage, cutoffMs)
  // The affected activities are exact only when the scan read every incident.
  const affectedActivities = coverage.complete ? activitySet.size : null

  // The cluster rule judges the top cluster's SCANNED share — a lower bound,
  // so it never raises a false "critical"; a capped scan means at least
  // CLUSTER_SCAN_LIMIT open incidents, which the total rule judges exactly.
  const status = statusOf(totalIncidents, clusters[0]?.scannedIncidentCount ?? 0, thresholds)
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
