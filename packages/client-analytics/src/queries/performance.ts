import {
  engineFilter,
  escapeString,
  type ClickHouseClient,
  type EngineFilterInput,
} from "../clickhouse.js"

export interface PerformanceKPI {
  process_definition_key: string
  total_instances: number
  completed: number
  failed: number
  failure_rate_pct: number
  avg_duration_sec: number
  median_duration_sec: number
  p95_duration_sec: number
  earliest: string
  latest: string
}

export interface ActivityBreakdownRow {
  activity_id: string
  activity_name: string | null
  activity_type: string
  execution_count: number
  avg_duration_sec: number
  median_duration_sec: number
  p95_duration_sec: number
  total_time_sec: number
}

export interface PeriodComparisonKpi {
  period: string
  total_instances: number
  completed: number
  failed: number
  failure_rate_pct: number
  avg_duration_sec: number
  median_sec: number
  p95_sec: number
}

export interface PeriodActivityComparisonRow {
  activity_id: string
  activity_name: string | null
  period: string
  executions: number
  avg_sec: number
  p95_sec: number
}

export interface PeriodComparisonResult {
  kpiComparison: PeriodComparisonKpi[]
  activityComparison?: PeriodActivityComparisonRow[]
}

export async function analyzePerformance(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey: string
    period: string
    includeActivityBreakdown: boolean
    engineId?: EngineFilterInput
  },
): Promise<{ kpi: PerformanceKPI | null; activityBreakdown: ActivityBreakdownRow[] }> {
  const interval = {
    "1d": "1 DAY",
    "7d": "7 DAY",
    "30d": "30 DAY",
    "90d": "90 DAY",
  }[params.period as "1d" | "7d" | "30d" | "90d"]

  const ef = engineFilter(params.engineId)
  const innerEngineFilter = ef ? `WHERE ${ef}` : ""
  const outerEngineFilter = ef ? `AND ${ef}` : ""

  // GROUP BY id first to collapse Camunda's per-state-transition rows, then
  // compute durations via dateDiff because the exporter never populates
  // `duration_in_millis` on process_instance rows.
  const kpiSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS median_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_duration_sec,
    min(start_time) AS earliest,
    max(start_time) AS latest
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    ${innerEngineFilter}
    GROUP BY id
) sub
WHERE process_definition_key = ${escapeString(params.processDefinitionKey)}
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key`

  const kpi = await ch.query<PerformanceKPI>(kpiSql)

  let activityBreakdown: ActivityBreakdownRow[] = []
  if (params.includeActivityBreakdown) {
    const actSql = `
SELECT
    activity_id,
    activity_name,
    activity_type,
    count() AS execution_count,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(duration_in_millis) / 1000, 1) AS median_duration_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_duration_sec,
    round(sum(duration_in_millis) / 1000, 1) AS total_time_sec
FROM camunda_history.camunda_activity_instances
WHERE process_definition_key = ${escapeString(params.processDefinitionKey)}
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
    ${outerEngineFilter}
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_sec DESC
LIMIT 20`
    activityBreakdown = await ch.query<ActivityBreakdownRow>(actSql)
  }

  return { kpi: kpi[0] ?? null, activityBreakdown }
}

export async function comparePeriods(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey: string
    periodAFrom: string
    periodATo: string
    periodBFrom: string
    periodBTo: string
    includeActivityBreakdown: boolean
    engineId?: EngineFilterInput
  },
): Promise<PeriodComparisonResult> {
  const key = escapeString(params.processDefinitionKey)
  // Wrap in parseDateTimeBestEffort so callers can pass ISO 8601 strings
  // (`2026-03-28T20:41:43.585Z`) — ClickHouse can't auto-coerce those to
  // DateTime64 in a comparison.
  const aFrom = `parseDateTimeBestEffort(${escapeString(params.periodAFrom)})`
  const aTo = `parseDateTimeBestEffort(${escapeString(params.periodATo)})`
  const bFrom = `parseDateTimeBestEffort(${escapeString(params.periodBFrom)})`
  const bTo = `parseDateTimeBestEffort(${escapeString(params.periodBTo)})`

  const ef = engineFilter(params.engineId)
  const innerEngineFilter = ef ? `WHERE ${ef}` : ""
  const efA = engineFilter(params.engineId, "a")
  const efP = engineFilter(params.engineId, "p")

  const kpiSql = `
SELECT
    CASE
        WHEN start_time >= ${aFrom} AND start_time <= ${aTo} THEN 'Period A'
        WHEN start_time >= ${bFrom} AND start_time <= ${bTo} THEN 'Period B'
    END AS period,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS median_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_sec
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    ${innerEngineFilter}
    GROUP BY id
) sub
WHERE process_definition_key = ${key}
    AND end_time IS NOT NULL
    AND (
        (start_time >= ${aFrom} AND start_time <= ${aTo})
        OR (start_time >= ${bFrom} AND start_time <= ${bTo})
    )
GROUP BY period
ORDER BY period`

  const kpiComparison = await ch.query<PeriodComparisonKpi>(kpiSql)
  const result: PeriodComparisonResult = { kpiComparison }

  if (params.includeActivityBreakdown) {
    const actSql = `
SELECT
    a.activity_id,
    a.activity_name,
    CASE
        WHEN p.start_time >= ${aFrom} AND p.start_time <= ${aTo} THEN 'Period A'
        WHEN p.start_time >= ${bFrom} AND p.start_time <= ${bTo} THEN 'Period B'
    END AS period,
    count() AS executions,
    round(avg(a.duration_in_millis) / 1000, 1) AS avg_sec,
    round(quantile(0.95)(a.duration_in_millis) / 1000, 1) AS p95_sec
FROM camunda_history.camunda_activity_instances a
JOIN camunda_history.camunda_process_instances p ON a.process_instance_id = p.id
WHERE p.process_definition_key = ${key}
    AND a.end_time IS NOT NULL
    AND (
        (p.start_time >= ${aFrom} AND p.start_time <= ${aTo})
        OR (p.start_time >= ${bFrom} AND p.start_time <= ${bTo})
    )
    ${efA ? `AND ${efA}` : ""}
    ${efP ? `AND ${efP}` : ""}
GROUP BY a.activity_id, a.activity_name, period
ORDER BY a.activity_id, period`
    result.activityComparison = await ch.query<PeriodActivityComparisonRow>(actSql)
  }

  return result
}
