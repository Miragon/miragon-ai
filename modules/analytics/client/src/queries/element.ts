import { escapeString, type ClickHouseClient } from "../clickhouse.js"

export interface ElementBottleneckRow {
  activity_id: string
  activity_name: string | null
  activity_type: string
  execution_count: number
  avg_duration_sec: number
  p95_duration_sec: number
  total_time_sec: number
  avg_wait_sec: number | null
  total_wait_sec: number | null
  incident_count: number
  incident_rate_pct: number
  bottleneck_score_sec: number
}

export interface ElementBottleneckResult {
  activities: ElementBottleneckRow[]
  minBucketSize: number
  suppressedActivities: number
}

const INTERVALS = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY", "90d": "90 DAY" } as const

export async function elementBottleneck(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey: string
    period: keyof typeof INTERVALS
    minBucketSize: number
    limit: number
  },
): Promise<ElementBottleneckResult> {
  const interval = INTERVALS[params.period]
  const key = escapeString(params.processDefinitionKey)
  const minBucket = Math.max(1, Math.floor(params.minBucketSize))
  const limit = Math.max(1, Math.floor(params.limit))

  // Wait time per activity = gap between the previous activity's end and this activity's
  // start within the same process instance (ordered by start_time). This approximates
  // idle/queue time and is typically the missing dimension in stock Camunda analytics.
  const cte = `
WITH activities AS (
    SELECT
        process_instance_id,
        activity_id,
        activity_name,
        activity_type,
        start_time,
        end_time,
        duration_in_millis,
        lagInFrame(end_time) OVER (
            PARTITION BY process_instance_id ORDER BY start_time
        ) AS prev_end_time
    FROM camunda_history.camunda_activity_instances
    WHERE process_definition_key = ${key}
        AND start_time >= now() - INTERVAL ${interval}
        AND end_time IS NOT NULL
        AND activity_id != ''
),
incident_counts AS (
    SELECT
        activity_id,
        count() AS incident_count
    FROM camunda_history.camunda_incidents FINAL
    WHERE process_definition_key = ${key}
        AND create_time >= now() - INTERVAL ${interval}
    GROUP BY activity_id
)`

  const activitiesSql = `${cte}
SELECT
    a.activity_id,
    any(a.activity_name) AS activity_name,
    any(a.activity_type) AS activity_type,
    count() AS execution_count,
    round(avg(a.duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(a.duration_in_millis) / 1000, 1) AS p95_duration_sec,
    round(sum(a.duration_in_millis) / 1000, 1) AS total_time_sec,
    round(avg(if(a.prev_end_time IS NULL, NULL, dateDiff('millisecond', a.prev_end_time, a.start_time))) / 1000, 1) AS avg_wait_sec,
    round(sum(if(a.prev_end_time IS NULL, 0, dateDiff('millisecond', a.prev_end_time, a.start_time))) / 1000, 1) AS total_wait_sec,
    ifNull(any(ic.incident_count), 0) AS incident_count,
    round(ifNull(any(ic.incident_count), 0) * 100.0 / count(), 2) AS incident_rate_pct,
    round((sum(a.duration_in_millis) + sum(if(a.prev_end_time IS NULL, 0, dateDiff('millisecond', a.prev_end_time, a.start_time)))) / 1000, 1) AS bottleneck_score_sec
FROM activities a
LEFT JOIN incident_counts ic ON ic.activity_id = a.activity_id
GROUP BY a.activity_id
HAVING count() >= ${minBucket}
ORDER BY bottleneck_score_sec DESC
LIMIT ${limit}`

  const totalSql = `${cte}
SELECT count() AS total_activities
FROM (
    SELECT a.activity_id
    FROM activities a
    GROUP BY a.activity_id
)`

  const [activities, totals] = await Promise.all([
    ch.query<ElementBottleneckRow>(activitiesSql),
    ch.query<{ total_activities: number }>(totalSql),
  ])

  return {
    activities,
    minBucketSize: minBucket,
    suppressedActivities: Math.max(0, (totals[0]?.total_activities ?? 0) - activities.length),
  }
}
