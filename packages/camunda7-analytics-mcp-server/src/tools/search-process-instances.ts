import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClickHouseClient } from '../clickhouse-client.js';
import { escapeString } from '../clickhouse-client.js';
import { z } from 'zod';

export function registerSearchProcessInstances(server: McpServer, ch: ClickHouseClient): void {
  server.tool(
    'search_process_instances',
    'Search historic process instances using flexible criteria via ClickHouse. Supports filtering by key, state, time range, duration, incidents, and variables.',
    {
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      businessKey: z.string().optional().describe('Filter by business key'),
      state: z.enum(['ACTIVE', 'COMPLETED', 'INTERNALLY_TERMINATED', 'EXTERNALLY_TERMINATED']).optional().describe('Filter by state'),
      startedAfter: z.string().optional().describe('ISO datetime — only instances started after this time'),
      startedBefore: z.string().optional().describe('ISO datetime — only instances started before this time'),
      durationGreaterThan: z.number().optional().describe('Minimum duration in milliseconds'),
      withIncidents: z.boolean().optional().describe('Only return instances that have incidents'),
      variableName: z.string().optional().describe('Filter by variable name (requires variableValue)'),
      variableValue: z.string().optional().describe('Filter by variable value (requires variableName)'),
      sortBy: z.enum(['startTime', 'endTime', 'duration']).default('startTime').describe('Sort field'),
      sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
      limit: z.number().int().positive().max(100).default(20).describe('Maximum results'),
    },
    async (params) => {
      const conditions: string[] = [];
      let joins = '';

      if (params.processDefinitionKey) {
        conditions.push(`p.process_definition_key = ${escapeString(params.processDefinitionKey)}`);
      }
      if (params.businessKey) {
        conditions.push(`p.business_key = ${escapeString(params.businessKey)}`);
      }
      if (params.state) {
        conditions.push(`p.state = ${escapeString(params.state)}`);
      }
      if (params.startedAfter) {
        conditions.push(`p.start_time >= ${escapeString(params.startedAfter)}`);
      }
      if (params.startedBefore) {
        conditions.push(`p.start_time <= ${escapeString(params.startedBefore)}`);
      }
      if (params.durationGreaterThan !== undefined) {
        conditions.push(`p.duration_in_millis > ${Number(params.durationGreaterThan)}`);
      }
      if (params.withIncidents) {
        joins += `\nJOIN camunda_history.camunda_incidents FINAL i ON p.id = i.process_instance_id`;
      }
      if (params.variableName && params.variableValue) {
        joins += `\nJOIN camunda_history.camunda_variable_updates FINAL v ON p.id = v.process_instance_id`;
        conditions.push(`v.variable_name = ${escapeString(params.variableName)}`);
        conditions.push(`v.text_value = ${escapeString(params.variableValue)}`);
      }

      const sortColumn = {
        startTime: 'p.start_time',
        endTime: 'p.end_time',
        duration: 'p.duration_in_millis',
      }[params.sortBy];

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
SELECT DISTINCT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.process_definition_name,
    p.business_key,
    p.state,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    p.start_user_id
FROM camunda_history.camunda_process_instances p${joins}
${where}
ORDER BY ${sortColumn} ${params.sortOrder}
LIMIT ${params.limit}`;

      const rows = await ch.query(sql);
      return { content: [{ type: 'text' as const, text: JSON.stringify(rows, null, 2) }] };
    },
  );
}
