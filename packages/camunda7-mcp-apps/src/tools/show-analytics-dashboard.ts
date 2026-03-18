import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getClickHouseClient } from '../lib/clickhouse.js';
import { escapeString } from '@camunda7-mcp/analytics-server/clickhouse-client';

export const tool: AppToolConfig = {
  resource: 'analytics-dashboard',
  title: 'Process Analytics Dashboard',
  description: 'Show aggregated process metrics and KPIs from ClickHouse analytics',
};

export const schema = {
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
  period: z.enum(['1d', '7d', '30d', '90d']).default('7d').describe('Analysis time period'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const ch = getClickHouseClient();

  const interval = {
    '1d': '1 DAY',
    '7d': '7 DAY',
    '30d': '30 DAY',
    '90d': '90 DAY',
  }[args.period];

  const keyFilter = args.processDefinitionKey
    ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}`
    : '';

  const kpiSql = `
SELECT
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'ACTIVE') AS running,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avgIf(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS avg_duration_sec,
    round(quantileIf(0.5)(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS median_duration_sec,
    round(quantileIf(0.95)(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL) / 1000, 1) AS p95_duration_sec
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
    ${keyFilter}`;

  const incidentSql = `
SELECT count() AS incident_count
FROM camunda_history.camunda_incidents FINAL
WHERE end_time IS NULL
    AND create_time >= now() - INTERVAL ${interval}
    ${args.processDefinitionKey ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}` : ''}`;

  const activitySql = `
SELECT
    activity_id,
    activity_name,
    activity_type,
    count() AS execution_count,
    round(avg(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS p95_duration_sec,
    round(sum(dateDiff('millisecond', start_time, end_time)) / 1000, 1) AS total_time_sec
FROM (
    SELECT
        id,
        any(activity_id) AS activity_id,
        any(activity_name) AS activity_name,
        any(activity_type) AS activity_type,
        any(process_definition_key) AS process_definition_key,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_activity_instances
    GROUP BY id
) sub
WHERE end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
    ${args.processDefinitionKey ? `AND process_definition_key = ${escapeString(args.processDefinitionKey)}` : ''}
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_sec DESC
LIMIT 20`;

  const definitionSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'ACTIVE') AS running,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(avgIf(dateDiff('millisecond', start_time, end_time), state = 'COMPLETED' AND end_time IS NOT NULL), 0) AS avg_duration_ms
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time,
        max(end_time) AS end_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
    ${keyFilter}
GROUP BY process_definition_key
ORDER BY total_instances DESC`;

  const [kpiRows, incidentRows, activityBreakdown, definitionBreakdown] = await Promise.all([
    ch.query<Record<string, number>>(kpiSql),
    ch.query<{ incident_count: number }>(incidentSql),
    ch.query(activitySql),
    ch.query(definitionSql),
  ]);

  const kpi = kpiRows[0];

  return {
    structuredContent: {
      totalCount: Number(kpi?.total_instances ?? 0),
      completedCount: Number(kpi?.completed ?? 0),
      runningCount: Number(kpi?.running ?? 0),
      failedCount: Number(kpi?.failed ?? 0),
      incidentCount: Number(incidentRows[0]?.incident_count ?? 0),
      failureRatePct: Number(kpi?.failure_rate_pct ?? 0),
      avgDurationMs: kpi?.avg_duration_sec != null ? Number(kpi.avg_duration_sec) * 1000 : null,
      medianDurationMs: kpi?.median_duration_sec != null ? Number(kpi.median_duration_sec) * 1000 : null,
      p95DurationMs: kpi?.p95_duration_sec != null ? Number(kpi.p95_duration_sec) * 1000 : null,
      activityBreakdown: activityBreakdown.map((a: Record<string, unknown>) => ({
        activityId: a.activity_id,
        activityName: a.activity_name,
        activityType: a.activity_type,
        executionCount: Number(a.execution_count),
        avgDurationMs: Number(a.avg_duration_sec ?? 0) * 1000,
        p95DurationMs: Number(a.p95_duration_sec ?? 0) * 1000,
        totalTimeMs: Number(a.total_time_sec ?? 0) * 1000,
      })),
      definitionBreakdown: definitionBreakdown.map((d: Record<string, unknown>) => ({
        processDefinitionKey: d.process_definition_key as string,
        totalInstances: Number(d.total_instances),
        completed: Number(d.completed),
        running: Number(d.running),
        failed: Number(d.failed),
        avgDurationMs: d.avg_duration_ms != null ? Number(d.avg_duration_ms) : null,
      })),
    },
  };
}
