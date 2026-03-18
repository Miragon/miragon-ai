import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { escapeString } from '../clickhouse-client.js';
import { z } from 'zod';

export function registerCompareExecutionPeriods(server: McpServer, ch: ClickHouseClient): void {
  server.tool(
    'compare_execution_periods',
    'Compare process execution metrics between two time periods. Useful for before/after deployment comparisons or regression analysis.',
    {
      processDefinitionKey: z.string().describe('Process definition key to compare'),
      periodAFrom: z.string().describe('Period A start (ISO datetime)'),
      periodATo: z.string().describe('Period A end (ISO datetime)'),
      periodBFrom: z.string().describe('Period B start (ISO datetime)'),
      periodBTo: z.string().describe('Period B end (ISO datetime)'),
      includeActivityBreakdown: z.boolean().default(false).describe('Include per-activity comparison'),
    },
    async (params) => {
      const key = escapeString(params.processDefinitionKey);
      const aFrom = escapeString(params.periodAFrom);
      const aTo = escapeString(params.periodATo);
      const bFrom = escapeString(params.periodBFrom);
      const bTo = escapeString(params.periodBTo);

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
ORDER BY period`;

      const kpi = await ch.query(kpiSql);
      const result: Record<string, unknown> = { kpiComparison: kpi };

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
GROUP BY a.activity_id, a.activity_name, period
ORDER BY a.activity_id, period`;
        result.activityComparison = await ch.query(actSql);
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
