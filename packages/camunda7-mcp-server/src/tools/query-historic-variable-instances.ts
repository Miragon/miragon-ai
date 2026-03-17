import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerQueryHistoricVariableInstances(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'query_historic_variable_instances',
    'Query historic variable instances. Shows variable values from process history.',
    {
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      variableName: z.string().optional().describe('Filter by exact variable name'),
      variableNameLike: z.string().optional().describe('Filter by variable name pattern'),
      maxResults: z.number().int().positive().optional().default(50),
      sortBy: z.enum(['instanceId', 'variableName', 'tenantId']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const variables = await adapter.queryHistoricVariableInstances({
        processInstanceId: params.processInstanceId,
        variableName: params.variableName,
        variableNameLike: params.variableNameLike,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(variables, null, 2) }] };
    },
  );
}
