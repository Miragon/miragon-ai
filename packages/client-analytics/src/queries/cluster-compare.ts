import {
  engineFilter,
  escapeString,
  type ClickHouseClient,
  type EngineFilterInput,
} from "../clickhouse.js"

export interface ClusterCompareKpi {
  period: "before" | "after"
  instance_count: number
  completed_count: number
  failed_count: number
  failure_rate_pct: number
  incident_count: number
  incident_rate_pct: number
  avg_duration_sec: number
  p95_duration_sec: number
  window_from: string
  window_to: string
}

export interface ClusterCompareDelta {
  instance_count_delta_pct: number | null
  failure_rate_delta_pp: number | null
  incident_rate_delta_pp: number | null
  avg_duration_delta_pct: number | null
  p95_duration_delta_pct: number | null
}

export interface ClusterCompareResult {
  processDefinitionKey: string | null
  elementId: string | null
  deploymentTimestamp: string
  windowDays: { before: number; after: number }
  minBucketSize: number
  suppressed: boolean
  kpis: ClusterCompareKpi[]
  delta: ClusterCompareDelta
}

/**
 * Pre/Post deployment comparison. Given a deployment timestamp and symmetric (or asymmetric)
 * windows before/after, compute instance KPIs + optional per-element incident rate.
 *
 * If either window has fewer than `minBucketSize` instances, the result is suppressed
 * (still returned, but with `suppressed: true`) so callers can render "insufficient signal"
 * instead of drawing conclusions from 3 instances.
 */
export async function clusterCompare(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey?: string
    elementId?: string
    deploymentTimestamp: string
    windowBeforeDays: number
    windowAfterDays: number
    minBucketSize: number
    engineId?: EngineFilterInput
  },
): Promise<ClusterCompareResult> {
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const before = Math.max(1, Math.floor(params.windowBeforeDays))
  const after = Math.max(1, Math.floor(params.windowAfterDays))
  const ts = escapeString(params.deploymentTimestamp)
  const keyFilter = params.processDefinitionKey
    ? `AND process_definition_key = ${escapeString(params.processDefinitionKey)}`
    : ""
  const activityFilter = params.elementId
    ? `AND activity_id = ${escapeString(params.elementId)}`
    : ""
  const ef = engineFilter(params.engineId)
  const engineClause = ef ? `AND ${ef}` : ""

  // Camunda's history exporter writes one row per state transition; collapse
  // them via GROUP BY id and compute durations from dateDiff(start, end)
  // because `duration_in_millis` on the process_instances table is null in
  // CIB-Seven exports — only the activity rows ever populate it.
  const kpiSql = `
WITH
    parseDateTimeBestEffort(${ts}) AS deploy_ts,
    deploy_ts - INTERVAL ${before} DAY AS before_from,
    deploy_ts + INTERVAL ${after} DAY AS after_to
SELECT
    multiIf(start_time < deploy_ts, 'before', 'after') AS period,
    count() AS instance_count,
    countIf(state = 'COMPLETED') AS completed_count,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed_count,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_duration_sec,
    toString(min(start_time)) AS window_from,
    toString(max(start_time)) AS window_to
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    ${ef ? `WHERE ${ef}` : ""}
    GROUP BY id
) sub
WHERE start_time >= before_from
    AND start_time < after_to
    AND end_time IS NOT NULL
    ${keyFilter}
GROUP BY period`

  const incidentSql = `
WITH
    parseDateTimeBestEffort(${ts}) AS deploy_ts,
    deploy_ts - INTERVAL ${before} DAY AS before_from,
    deploy_ts + INTERVAL ${after} DAY AS after_to
SELECT
    multiIf(create_time < deploy_ts, 'before', 'after') AS period,
    count() AS incident_count
FROM camunda_history.camunda_incidents
WHERE create_time >= before_from
    AND create_time < after_to
    ${keyFilter}
    ${activityFilter}
    ${engineClause}
GROUP BY period`

  interface KpiRow {
    period: "before" | "after"
    instance_count: number
    completed_count: number
    failed_count: number
    failure_rate_pct: number
    avg_duration_sec: number
    p95_duration_sec: number
    window_from: string
    window_to: string
  }
  interface IncidentRow {
    period: "before" | "after"
    incident_count: number
  }

  const [kpiRows, incidentRows] = await Promise.all([
    ch.query<KpiRow>(kpiSql),
    ch.query<IncidentRow>(incidentSql),
  ])

  const incidentByPeriod: Record<string, number> = {}
  for (const r of incidentRows) incidentByPeriod[r.period] = Number(r.incident_count)

  const kpis: ClusterCompareKpi[] = (["before", "after"] as const).map((p) => {
    const row = kpiRows.find((r) => r.period === p)
    const instances = Number(row?.instance_count ?? 0)
    const incidents = incidentByPeriod[p] ?? 0
    return {
      period: p,
      instance_count: instances,
      completed_count: Number(row?.completed_count ?? 0),
      failed_count: Number(row?.failed_count ?? 0),
      failure_rate_pct: Number(row?.failure_rate_pct ?? 0),
      incident_count: incidents,
      incident_rate_pct: instances > 0 ? Math.round((incidents * 10000) / instances) / 100 : 0,
      avg_duration_sec: Number(row?.avg_duration_sec ?? 0),
      p95_duration_sec: Number(row?.p95_duration_sec ?? 0),
      window_from: String(row?.window_from ?? ""),
      window_to: String(row?.window_to ?? ""),
    }
  })

  const [b, a] = kpis
  const suppressed = b.instance_count < minBucket || a.instance_count < minBucket

  return {
    processDefinitionKey: params.processDefinitionKey ?? null,
    elementId: params.elementId ?? null,
    deploymentTimestamp: params.deploymentTimestamp,
    windowDays: { before, after },
    minBucketSize: minBucket,
    suppressed,
    kpis,
    delta: {
      instance_count_delta_pct: pctChange(b.instance_count, a.instance_count),
      failure_rate_delta_pp: round1(a.failure_rate_pct - b.failure_rate_pct),
      incident_rate_delta_pp: round1(a.incident_rate_pct - b.incident_rate_pct),
      avg_duration_delta_pct: pctChange(b.avg_duration_sec, a.avg_duration_sec),
      p95_duration_delta_pct: pctChange(b.p95_duration_sec, a.p95_duration_sec),
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
