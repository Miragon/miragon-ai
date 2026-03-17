import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { getVariablesSchema } from '@camunda7-mcp/shared';

export function registerGetVariables(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'get_variables',
    'Get variables from a process instance or task. Specify scope (process-instance or task) and the ID.',
    getVariablesSchema.shape,
    async (params) => {
      const variables = await adapter.getVariables(params.scope, params.id);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(variables, null, 2) }],
      };
    },
  );
}
