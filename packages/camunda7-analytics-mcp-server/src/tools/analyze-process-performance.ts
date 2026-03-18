import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { escapeString } from '../clickhouse-client.js';
import { z } from 'zod';

export function registerAnalyzeProcessPerformance(server: McpServer, ch: ClickHouseClient): void {
  server.tool(
    'analyze_process_performance',
    'Analyze process performance: throughput, P95 duration, failure rate, and bottleneck activities.',
    {
      processDefinitionKey: z.string().describe('Process definition key to analyze'),
      period: z.enum(['1d', '7d', '30d', '90d']).default('7d').describe('Analysis time period'),
      includeActivityBreakdown: z.boolean().default(true).describe('Include per-activity bottleneck analysis'),
    },
    async (params) => {
      const interval = {
        '1d': '1 DAY',
        '7d': '7 DAY',
        '30d': '30 DAY',
        '90d': '90 DAY',
      }[params.period];

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
WHERE process_definition_key = ${escapeString(params.processDefinitionKey)}
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key`;

      const kpi = await ch.query(kpiSql);

      let activityBreakdown: unknown[] = [];
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
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_sec DESC
LIMIT 20`;
        activityBreakdown = await ch.query(actSql);
      }

      const result = { kpi: kpi[0] ?? null, activityBreakdown };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
