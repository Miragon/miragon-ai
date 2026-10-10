import { earliestEngineDate, engineDateMillis } from "@miragon-ai/camunda7-client"

/**
 * The incident scan behind the failure clusters — shared by the engine-health
 * overview (`health-data.ts`) and the cluster drill-in
 * (`cluster-detail-data.ts`): the scan's depth and reach, and the message
 * signature that defines a cluster.
 */

export const HOUR_MS = 60 * 60 * 1000

/**
 * How many incidents the health views scan, newest first — deeper than the
 * shared `INCIDENT_SCAN_LIMIT` (engine-reads.ts) because the clusters are
 * built from it, and capped so the feed stays cheap on a busy engine. A
 * count the scan cannot vouch for once it hits this limit is null or read
 * from `/incident/count` — never the scan's length passed off as a total.
 */
export const CLUSTER_SCAN_LIMIT = 2000

/** Placeholder for an incident without an activity / a resolvable definition key. */
export const UNKNOWN = "(unknown)"

export interface IncidentLike {
  id?: string | null
  processDefinitionId?: string | null
  processInstanceId?: string | null
  incidentType?: string | null
  activityId?: string | null
  incidentMessage?: string | null
  incidentTimestamp?: string | null
}

/** What a newest-first scan of up to {@link CLUSTER_SCAN_LIMIT} rows can vouch for. */
export interface ScanCoverage {
  /** The scan read every matching incident. */
  complete: boolean
  /** Every incident at or after `sinceMs` is in the scan (complete, or its oldest row predates it). */
  covers: (sinceMs: number) => boolean
}

export function scanCoverage(rows: IncidentLike[]): ScanCoverage {
  const complete = rows.length < CLUSTER_SCAN_LIMIT
  const oldest = engineDateMillis(earliestEngineDate(rows.map((r) => r.incidentTimestamp)))
  return { complete, covers: (sinceMs) => complete || (oldest !== null && oldest < sinceMs) }
}

/**
 * One-line truncation for cluster sample messages — engine exception messages
 * can be stacktrace-sized, and the sample travels into the widget render, the
 * data feed, and the "Fix" AI prompt.
 */
export function truncateMessage(s: string | null, max = 300): string | null {
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
export function messageSignature(msg: string | null): string {
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
