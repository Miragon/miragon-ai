import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { listProcessDefinitionsSchema } from '@camunda7-mcp/shared';

export function registerListProcessDefinitions(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_process_definitions',
    'List deployed process definitions with optional filters. Returns key, name, version, and deployment info.',
    listProcessDefinitionsSchema.shape,
    async (params) => {
      const definitions = await adapter.listProcessDefinitions({
        key: params.key,
        nameLike: params.nameLike,
        latestVersion: params.latestVersion,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(definitions, null, 2) }],
      };
    },
  );
}
