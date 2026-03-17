import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerListDeployments(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_deployments',
    'List deployments with optional filters.',
    {
      name: z.string().optional().describe('Filter by deployment name'),
      nameLike: z.string().optional().describe('Filter by deployment name (substring)'),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(['id', 'name', 'deploymentTime', 'tenantId']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const deployments = await adapter.listDeployments({
        name: params.name,
        nameLike: params.nameLike,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(deployments, null, 2) }] };
    },
  );
}
