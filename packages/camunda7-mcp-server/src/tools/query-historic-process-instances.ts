import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerQueryHistoricProcessInstances(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'query_historic_process_instances',
    'Query historic process instances with filters. Returns completed and running instances from history.',
    {
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      finished: z.boolean().optional().describe('Only finished instances'),
      unfinished: z.boolean().optional().describe('Only unfinished (running) instances'),
      startedBefore: z.string().optional().describe('Started before date (ISO 8601)'),
      startedAfter: z.string().optional().describe('Started after date (ISO 8601)'),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(['instanceId', 'definitionId', 'definitionKey', 'definitionName', 'startTime', 'endTime', 'duration', 'tenantId', 'businessKey']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const instances = await adapter.queryHistoricProcessInstances({
        processDefinitionKey: params.processDefinitionKey,
        finished: params.finished,
        unfinished: params.unfinished,
        startedBefore: params.startedBefore,
        startedAfter: params.startedAfter,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(instances, null, 2) }] };
    },
  );
}
