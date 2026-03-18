import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { escapeString } from '../clickhouse-client.js';
import { z } from 'zod';

export function registerFindFailedInstances(server: McpServer, ch: ClickHouseClient): void {
  server.tool(
    'find_failed_instances',
    'Find failed process instances with incident details and error patterns. Optionally group by error message to identify common failure patterns.',
    {
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      period: z.enum(['1d', '7d', '30d']).default('7d').describe('Time period to search'),
      incidentType: z.string().optional().describe('Filter by incident type (e.g. failedJob)'),
      groupByError: z.boolean().default(false).describe('Group results by error message to show patterns'),
      limit: z.number().int().positive().max(100).default(20).describe('Maximum results'),
    },
    async (params) => {
      const interval = { '1d': '1 DAY', '7d': '7 DAY', '30d': '30 DAY' }[params.period];

      const conditions: string[] = [
        `i.create_time >= now() - INTERVAL ${interval}`,
      ];
      if (params.processDefinitionKey) {
        conditions.push(`i.process_definition_key = ${escapeString(params.processDefinitionKey)}`);
      }
      if (params.incidentType) {
        conditions.push(`i.incident_type = ${escapeString(params.incidentType)}`);
      }

      const where = conditions.join(' AND ');

      let sql: string;
      if (params.groupByError) {
        sql = `
SELECT
    i.incident_message,
    i.activity_id,
    i.process_definition_key,
    count() AS incident_count,
    min(i.create_time) AS first_occurrence,
    max(i.create_time) AS last_occurrence,
    groupArray(10)(i.process_instance_id) AS sample_instance_ids
FROM camunda_history.camunda_incidents i
WHERE ${where}
GROUP BY i.incident_message, i.activity_id, i.process_definition_key
ORDER BY incident_count DESC
LIMIT ${params.limit}`;
      } else {
        sql = `
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    i.incident_type,
    i.incident_message,
    i.activity_id AS failed_activity,
    i.create_time AS incident_time
FROM camunda_history.camunda_incidents i
JOIN camunda_history.camunda_process_instances p ON p.id = i.process_instance_id
WHERE ${where}
ORDER BY i.create_time DESC
LIMIT ${params.limit}`;
      }

      const rows = await ch.query(sql);
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );
}
