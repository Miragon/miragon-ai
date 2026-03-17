import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerResolveIncident(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'resolve_incident',
    'Resolve an incident by ID.',
    { incidentId: z.string().describe('The incident ID to resolve') },
    async (params) => {
      await adapter.resolveIncident(params.incidentId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, incidentId: params.incidentId }, null, 2) }] };
    },
  );
}
