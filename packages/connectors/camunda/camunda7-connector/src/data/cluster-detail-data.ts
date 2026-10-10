import {
  earliestEngineDate,
  engineLike,
  latestEngineDate,
  toEngineDate,
  type Client,
} from "@miragon-ai/camunda7-client"
import {
  getIncidents,
  getIncidentsCount,
  getProcessInstances,
} from "@miragon-ai/camunda7-client/sdk"
import type { ClusterDetailData, ClusterIncidentRow } from "../view-models.js"
import type { ClusterDetailFilters, PagingArgs } from "../feed-contracts.js"
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
import { processDefinitionKeyFromId } from "./definition-info.js"
import { countOf, DAY_MS, rowsOf } from "./engine-reads.js"
import { isOnOrAfter } from "./incident-scan.js"

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
 *
 * The newest-first scan holds at most {@link CLUSTER_SCAN_LIMIT} incidents.
 * Once it hits that limit — a mass failure, exactly when a cluster gets
 * drilled into — its length is no total: without a message filter the counts
 * come from `/incident/count`, with one the counts the scan cannot vouch for
 * are null, and `scannedIncidentCount` says how much of the cluster the list
 * covers.
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
        maxResults: CLUSTER_SCAN_LIMIT,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
      },
    }).then((rows) => rowsOf<IncidentLike>(rows)),
    args.businessKeyLike
      ? getProcessInstances({
          client,
          query: {
            businessKeyLike: engineLike(args.businessKeyLike),
            maxResults: CLUSTER_SCAN_LIMIT,
          },
        }).then((rows) => rowsOf<{ id?: string | null }>(rows))
      : Promise.resolve(null),
  ])

  const coverage = scanCoverage(incidentsRaw)
  const matching =
    args.messageSignature === undefined
      ? incidentsRaw
      : incidentsRaw.filter(
          (i) => messageSignature(i.incidentMessage ?? null) === args.messageSignature,
        )

  const listed = filterToSearchHits(matching, searchHitsRaw)

  const nowMs = Date.now()
  const kpis = aggregateClusterKpis(matching)

  // Paging slices the in-memory listed set (not an engine-side offset): the
  // messageSignature/business-key filters are resolved here, so an offset
  // re-query would change semantics without saving the scan. The list is
  // therefore bounded by the scan — `scannedIncidentCount` discloses it.
  const first = Math.max(0, args.firstResult ?? 0)
  const pageSize = args.maxResults ?? CLUSTER_DETAIL_ROWS
  const page = listed.slice(first, first + pageSize)

  const [counts, businessKeyById] = await Promise.all([
    clusterCounts(client, args, { coverage, matching, nowMs }),
    resolveBusinessKeys(client, page),
  ])

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
    ...counts,
    scannedIncidentCount: matching.length,
    // The scan is newest first: its oldest row is the cluster's first only
    // when the scan holds the whole cluster.
    firstSeen: coverage.complete ? earliestEngineDate(kpis.timestamps) : null,
    latestIncident: latestEngineDate(kpis.timestamps),
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

/** The scanned cluster's timestamps and its process keys by scanned incidents. */
function aggregateClusterKpis(matching: IncidentLike[]): {
  timestamps: Array<string | null | undefined>
  defCounts: Map<string, number>
} {
  const defCounts = new Map<string, number>()
  for (const inc of matching) {
    const defKey = inc.processDefinitionId
      ? processDefinitionKeyFromId(inc.processDefinitionId)
      : UNKNOWN
    defCounts.set(defKey, (defCounts.get(defKey) ?? 0) + 1)
  }
  return { timestamps: matching.map((inc) => inc.incidentTimestamp), defCounts }
}

type ClusterWindowCounts = Pick<
  ClusterDetailData,
  "incidentCount" | "lastHourCount" | "last24hCount"
>

/**
 * The cluster's total and its last-hour / 24h profile, each from the scan
 * where the scan can vouch for it (it holds the whole cluster, or reaches
 * back past the window), otherwise from `/incident/count` — which can only
 * answer the cluster WITHOUT a message filter (activity + type are its
 * filters); with one, an unvouched count is null.
 */
function clusterCounts(
  client: Client,
  args: ClusterDetailArgs,
  scan: { coverage: ScanCoverage; matching: IncidentLike[]; nowMs: number },
): Promise<ClusterWindowCounts> {
  const { coverage, matching, nowMs } = scan
  const exact = (sinceMs?: number) =>
    args.messageSignature === undefined
      ? getIncidentsCount({
          client,
          query: {
            activityId: args.activityId,
            incidentType: args.incidentType,
            incidentTimestampAfter:
              sinceMs === undefined ? undefined : toEngineDate(new Date(sinceMs)),
          },
        }).then(countOf)
      : Promise.resolve(null)
  const since = (sinceMs: number) =>
    coverage.covers(sinceMs)
      ? Promise.resolve(matching.filter((i) => isOnOrAfter(i.incidentTimestamp, sinceMs)).length)
      : exact(sinceMs)
  return Promise.all([
    coverage.complete ? Promise.resolve(matching.length) : exact(),
    since(nowMs - HOUR_MS),
    since(nowMs - DAY_MS),
  ]).then(([incidentCount, lastHourCount, last24hCount]) => ({
    incidentCount,
    lastHourCount,
    last24hCount,
  }))
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
