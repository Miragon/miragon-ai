import { z } from "zod"
import type { createToolRegistrar } from "@automation-mcp/core"
import { escapeString, type ClickHouseClient } from "../client.js"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerPerformanceTools(register: Register) {
  register({
    name: "analytics_analyze_process_performance",
    description:
      "Analyze process performance: throughput, P95 duration, failure rate, and bottleneck activities.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      processDefinitionKey: z.string().describe("Process definition key to analyze"),
      period: z
        .enum(["1d", "7d", "30d", "90d"])
        .default("7d")
        .describe("Analysis time period"),
      includeActivityBreakdown: z
        .boolean()
        .default(true)
        .describe("Include per-activity bottleneck analysis"),
    },
    handler: async (ch, args) => {
      const interval = {
        "1d": "1 DAY",
        "7d": "7 DAY",
        "30d": "30 DAY",
        "90d": "90 DAY",
      }[args.period as "1d" | "7d" | "30d" | "90d"]

      const kpiSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(duration_in_millis) / 1000, 1) AS median_duration_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_duration_sec,
    min(start_time) AS earliest,
    max(start_time) AS latest
FROM camunda_history.camunda_process_instances
WHERE process_definition_key = ${escapeString(args.processDefinitionKey)}
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key`

      const kpi = await ch.query(kpiSql)

      let activityBreakdown: unknown[] = []
      if (args.includeActivityBreakdown) {
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
WHERE process_definition_key = ${escapeString(args.processDefinitionKey)}
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_sec DESC
LIMIT 20`
        activityBreakdown = await ch.query(actSql)
      }

      return { kpi: kpi[0] ?? null, activityBreakdown }
    },
  })

  register({
    name: "analytics_compare_execution_periods",
    description:
      "Compare process execution metrics between two time periods. Useful for before/after deployment comparisons or regression analysis.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      processDefinitionKey: z.string().describe("Process definition key to compare"),
      periodAFrom: z.string().describe("Period A start (ISO datetime)"),
      periodATo: z.string().describe("Period A end (ISO datetime)"),
      periodBFrom: z.string().describe("Period B start (ISO datetime)"),
      periodBTo: z.string().describe("Period B end (ISO datetime)"),
      includeActivityBreakdown: z
        .boolean()
        .default(false)
        .describe("Include per-activity comparison"),
    },
    handler: async (ch, args) => {
      const key = escapeString(args.processDefinitionKey)
      const aFrom = escapeString(args.periodAFrom)
      const aTo = escapeString(args.periodATo)
      const bFrom = escapeString(args.periodBFrom)
      const bTo = escapeString(args.periodBTo)

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
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(duration_in_millis) / 1000, 1) AS median_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_sec
FROM camunda_history.camunda_process_instances
WHERE process_definition_key = ${key}
    AND end_time IS NOT NULL
    AND (
        (start_time >= ${aFrom} AND start_time <= ${aTo})
        OR (start_time >= ${bFrom} AND start_time <= ${bTo})
    )
GROUP BY period
ORDER BY period`

      const kpi = await ch.query(kpiSql)
      const result: Record<string, unknown> = { kpiComparison: kpi }

      if (args.includeActivityBreakdown) {
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
GROUP BY a.activity_id, a.activity_name, period
ORDER BY a.activity_id, period`
        result.activityComparison = await ch.query(actSql)
      }

      return result
    },
  })
}
