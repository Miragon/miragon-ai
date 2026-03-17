import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { escapeString } from '../clickhouse-client.js';
import { z } from 'zod';

export function registerSearchByVariable(server: McpServer, ch: ClickHouseClient): void {
  server.tool(
    'search_by_variable',
    'Search process instances by variable name and value. Useful for finding instances by business identifiers like orderId, customerId, etc.',
    {
      variableName: z.string().describe('Variable name to search for'),
      variableValue: z.string().describe('Variable value to match (text comparison)'),
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      limit: z.number().int().positive().max(100).default(20).describe('Maximum results'),
    },
    async (params) => {
      const conditions: string[] = [
        `v.variable_name = ${escapeString(params.variableName)}`,
        `v.text_value = ${escapeString(params.variableValue)}`,
      ];
      if (params.processDefinitionKey) {
        conditions.push(`p.process_definition_key = ${escapeString(params.processDefinitionKey)}`);
      }

      const sql = `
SELECT DISTINCT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.state,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    v.variable_name,
    v.text_value
FROM camunda_history.camunda_variable_updates v
JOIN camunda_history.camunda_process_instances p ON p.id = v.process_instance_id
WHERE ${conditions.join(' AND ')}
ORDER BY v.timestamp DESC
LIMIT ${params.limit}`;

      const rows = await ch.query(sql);
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );
}
