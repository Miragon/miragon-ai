import {
  engineFilter,
  escapeString,
  type ClickHouseClient,
  type EngineFilterInput,
} from "../clickhouse.js"

export interface VersionCompareKpi {
  version: number
  bucket: "versionA" | "versionB"
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
}

export interface VersionCompareDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

export interface VersionCompareResult {
  processDefinitionKey: string
  versionA: number
  versionB: number
  windowDays: number
  elementId: string | null
  minBucketSize: number
  suppressed: boolean
  kpis: VersionCompareKpi[]
  delta: VersionCompareDelta
}

/**
 * Side-by-side comparison of two deployed process definition versions.
 *
 * Partitions instances by `process_definition_id` (Camunda format
 * `key:version:uuid`) within a shared time window. Mirrors clusterCompare's
 * shape but answers a different question: did rolling out v2 measurably move
 * the KPIs vs the v1 cohort still in flight?
 *
 * Suppresses the result (returns `suppressed: true`) when either version's
 * cohort is below `minBucketSize` — keeps callers from drawing conclusions
 * from a handful of instances right after a partial rollout.
 */
export async function versionCompare(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey: string
    versionA: number
    versionB: number
    windowDays: number
    elementId?: string
    minBucketSize: number
    engineId?: EngineFilterInput
  },
): Promise<VersionCompareResult> {
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const windowDays = Math.max(1, Math.floor(params.windowDays))
  const versionA = Math.max(1, Math.floor(params.versionA))
  const versionB = Math.max(1, Math.floor(params.versionB))
  const key = escapeString(params.processDefinitionKey)
  const prefixA = escapeString(`${params.processDefinitionKey}:${versionA}:%`)
  const prefixB = escapeString(`${params.processDefinitionKey}:${versionB}:%`)
  const activityFilter = params.elementId
    ? `AND activity_id = ${escapeString(params.elementId)}`
    : ""
  const ef = engineFilter(params.engineId)
  const engineClause = ef ? `AND ${ef}` : ""

  // GROUP BY id first to collapse Camunda's per-state-transition rows into one
  // row per instance, then compute durations via dateDiff because the exporter
  // does not populate `duration_in_millis` on process_instance rows. Filters
  // belong in the outer WHERE so they apply post-aggregation; ClickHouse
  // rejects them in the inner WHERE alongside aggregate functions.
  const kpiSql = `
WITH
    now() - INTERVAL ${windowDays} DAY AS since
SELECT
    multiIf(
        process_definition_id LIKE ${prefixA}, 'versionA',
        process_definition_id LIKE ${prefixB}, 'versionB',
        'other'
    ) AS bucket,
    count() AS instance_count,
    countIf(state = 'COMPLETED') AS completed_count,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed_count,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_duration_sec
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        any(process_definition_id) AS process_definition_id,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    ${ef ? `WHERE ${ef}` : ""}
    GROUP BY id
) sub
WHERE process_definition_key = ${key}
    AND start_time >= since
    AND end_time IS NOT NULL
    AND (process_definition_id LIKE ${prefixA} OR process_definition_id LIKE ${prefixB})
GROUP BY bucket`

  const incidentSql = `
WITH
    now() - INTERVAL ${windowDays} DAY AS since
SELECT
    multiIf(
        process_definition_id LIKE ${prefixA}, 'versionA',
        process_definition_id LIKE ${prefixB}, 'versionB',
        'other'
    ) AS bucket,
    count() AS incident_count
FROM camunda_history.camunda_incidents
WHERE process_definition_key = ${key}
    AND create_time >= since
    AND (process_definition_id LIKE ${prefixA} OR process_definition_id LIKE ${prefixB})
    ${activityFilter}
    ${engineClause}
GROUP BY bucket`

  interface KpiRow {
    bucket: "versionA" | "versionB" | "other"
    instance_count: number
    completed_count: number
    failed_count: number
    failure_rate_pct: number
    avg_duration_sec: number
    p95_duration_sec: number
  }
  interface IncidentRow {
    bucket: "versionA" | "versionB" | "other"
    incident_count: number
  }

  const [kpiRows, incidentRows] = await Promise.all([
    ch.query<KpiRow>(kpiSql),
    ch.query<IncidentRow>(incidentSql),
  ])

  const incidentByBucket: Record<string, number> = {}
  for (const r of incidentRows) incidentByBucket[r.bucket] = Number(r.incident_count)

  const buckets = [
    { bucket: "versionA" as const, version: versionA },
    { bucket: "versionB" as const, version: versionB },
  ]
  const kpis: VersionCompareKpi[] = buckets.map(({ bucket, version }) => {
    const row = kpiRows.find((r) => r.bucket === bucket)
    const instances = Number(row?.instance_count ?? 0)
    const incidents = incidentByBucket[bucket] ?? 0
    return {
      version,
      bucket,
      instance_count: instances,
      completed_count: Number(row?.completed_count ?? 0),
      failed_count: Number(row?.failed_count ?? 0),
      failure_rate_pct: Number(row?.failure_rate_pct ?? 0),
      incident_count: incidents,
      incident_rate_pct: instances > 0 ? Math.round((incidents * 10000) / instances) / 100 : 0,
      avg_duration_sec: Number(row?.avg_duration_sec ?? 0),
      p95_duration_sec: Number(row?.p95_duration_sec ?? 0),
    }
  })

  const [a, b] = kpis
  const suppressed = a.instance_count < minBucket || b.instance_count < minBucket

  return {
    processDefinitionKey: params.processDefinitionKey,
    versionA,
    versionB,
    windowDays,
    elementId: params.elementId ?? null,
    minBucketSize: minBucket,
    suppressed,
    kpis,
    delta: {
      instance_count_delta_pct: pctChange(a.instance_count, b.instance_count),
      failure_rate_delta_pp: round1(b.failure_rate_pct - a.failure_rate_pct),
      incident_rate_delta_pp: round1(b.incident_rate_pct - a.incident_rate_pct),
      avg_duration_delta_pct: pctChange(a.avg_duration_sec, b.avg_duration_sec),
      p95_duration_delta_pct: pctChange(a.p95_duration_sec, b.p95_duration_sec),
    },
  }
}

function pctChange(before: number, after: number): number | null {
  if (before === 0) return null
  return Math.round(((after - before) / before) * 10000) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
