import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerListProcessInstances(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_process_instances',
    'List running process instances with optional filters.',
    {
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      businessKey: z.string().optional().describe('Filter by business key'),
      active: z.boolean().optional().describe('Only active instances'),
      suspended: z.boolean().optional().describe('Only suspended instances'),
      maxResults: z.number().int().positive().optional().default(20).describe('Maximum results'),
      sortBy: z.enum(['instanceId', 'definitionKey', 'definitionId', 'tenantId', 'businessKey']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const instances = await adapter.listProcessInstances({
        processDefinitionKey: params.processDefinitionKey,
        businessKey: params.businessKey,
        active: params.active,
        suspended: params.suspended,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(instances, null, 2) }] };
    },
  );
}
