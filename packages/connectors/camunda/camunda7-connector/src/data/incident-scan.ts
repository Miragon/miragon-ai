import {
  earliestEngineDate,
  engineDateMillis,
  incidentRecovery,
  latestEngineDate,
  type Client,
} from "@miragon-ai/camunda7-client"
import { getIncidents } from "@miragon-ai/camunda7-client/sdk"
import type { IncidentInstance } from "../view-models.js"
import type { EngineProvider } from "../engine-provider.js"
import { buildInstanceCockpitUrl } from "../lib/cockpit-url.js"
import { definitionVersionFromId } from "./definition-info.js"
import { INCIDENT_SCAN_LIMIT, rowsOf } from "./engine-reads.js"

/**
 * The incident RECENCY SCAN shared by the incident views: the newest
 * {@link INCIDENT_SCAN_LIMIT} open incidents, newest first. It is enrichment
 * only — the latest message, timestamps, a per-activity breakdown — and it
 * knows exactly how far it reaches: a fact it cannot vouch for is `null`,
 * never a count over a capped page.
 */

/**
 * An `/incident` row. It carries the definition id, not the key: a view
 * queried by key uses that key; any other resolves the id
 * (`resolveDefinitionKeys`/`definitionKeyResolver`, definition-info.ts).
 */
export interface IncidentRow {
  id: string
  processDefinitionId: string
  processInstanceId: string
  incidentType: string
  activityId: string
  incidentMessage: string | null
  incidentTimestamp: string
  configuration: string | null
}

export interface IncidentScan {
  /** Newest first. */
  rows: IncidentRow[]
  /** The scan read every matching incident (the engine returned fewer than the limit). */
  complete: boolean
  /**
   * Whether the scan provably reaches back past `sinceMs` — its oldest row
   * predates it, so every incident at or after `sinceMs` is in `rows`.
   */
  reachesBefore: (sinceMs: number) => boolean
}

export async function scanIncidents(
  client: Client,
  filter: { processDefinitionKeyIn?: string; incidentType?: string },
): Promise<IncidentScan> {
  const rows = rowsOf<IncidentRow>(
    await getIncidents({
      client,
      query: {
        ...filter,
        maxResults: INCIDENT_SCAN_LIMIT,
        sortBy: "incidentTimestamp",
        sortOrder: "desc",
      },
    }),
  )
  const complete = rows.length < INCIDENT_SCAN_LIMIT
  // Newest first: once the oldest scanned incident predates `sinceMs`, nothing
  // newer than it can be missing.
  const oldest = engineDateMillis(earliestEngineDate(rows.map((r) => r.incidentTimestamp)))
  return {
    rows,
    complete,
    reachesBefore: (sinceMs) => oldest !== null && oldest < sinceMs,
  }
}

/** Bucket rows by the given key (scan order — newest first — kept per bucket). */
export function groupBy<T>(rows: T[], by: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = by(r)
    const list = map.get(k) ?? []
    list.push(r)
    map.set(k, list)
  }
  return map
}

/** Engine timestamps carry the engine's UTC offset — compare instants, never strings. */
export function isOnOrAfter(timestamp: string | null | undefined, cutoffMs: number): boolean {
  const ms = engineDateMillis(timestamp)
  return ms !== null && ms >= cutoffMs
}

/** What the scan can vouch for about one group (a process, an activity) of incidents. */
export interface ScanFacts {
  representativeMessage: string | null
  /** Exact whenever the group appears in the scan (it is newest first); null otherwise. */
  latestIncident: string | null
  /** Exact only when the scan holds ALL of the group's incidents; null otherwise. */
  firstSeen: string | null
  /**
   * Exact when the scan holds ALL of the group's incidents, or reaches back
   * past the cutoff; null otherwise.
   */
  last24hCount: number | null
}

/**
 * `fullyScanned` is the caller's claim that `groupRows` hold every incident
 * of the group — decided against an exact count (statistics, `/count`),
 * never from the scan's completeness alone: a complete scan whose rows a
 * view cannot attribute to the group must not vouch for it.
 */
export function scanFacts(
  groupRows: IncidentRow[],
  options: { fullyScanned: boolean; scan: IncidentScan; cutoffMs: number },
): ScanFacts {
  const timestamps = groupRows.map((r) => r.incidentTimestamp)
  return {
    representativeMessage: groupRows[0]?.incidentMessage ?? null,
    latestIncident: latestEngineDate(timestamps),
    firstSeen: options.fullyScanned ? earliestEngineDate(timestamps) : null,
    last24hCount:
      options.fullyScanned || options.scan.reachesBefore(options.cutoffMs)
        ? timestamps.filter((ts) => isOnOrAfter(ts, options.cutoffMs)).length
        : null,
  }
}

/** Cockpit-URL context of an incident row's instance link. */
export interface IncidentLinkContext {
  baseUrl: string
  cockpitUrl?: string
  provider: EngineProvider
  /** The key the rows were queried by — every row runs on it. */
  processDefinitionKey: string
}

/**
 * An incident row of a KEY-scoped query as the widgets list it. The cockpit
 * instance link addresses the view's key — the row's definition id may be a
 * bare generated one (long keys) that names none — and the row's OWN version
 * (the one that instance runs on; unknown for a bare id), not the key's
 * latest: no definition lookup per page.
 */
export function toIncidentInstance(r: IncidentRow, ctx: IncidentLinkContext): IncidentInstance {
  return {
    id: r.id,
    processInstanceId: r.processInstanceId,
    incidentType: r.incidentType,
    incidentMessage: r.incidentMessage ?? null,
    incidentTimestamp: r.incidentTimestamp,
    recovery: incidentRecovery(r),
    cockpitInstanceUrl: buildInstanceCockpitUrl(
      ctx,
      {
        key: ctx.processDefinitionKey,
        version: definitionVersionFromId(r.processDefinitionId),
        definitionId: r.processDefinitionId,
        instanceId: r.processInstanceId,
      },
      // Drill-in from an incident list: the operator is debugging failures.
      { tab: "incidents" },
    ),
  }
}
