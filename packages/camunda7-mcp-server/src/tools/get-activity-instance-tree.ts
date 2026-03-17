import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerGetActivityInstanceTree(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'get_activity_instance_tree',
    'Get the activity instance tree of a running process instance. Shows which activities are currently active.',
    { processInstanceId: z.string().describe('The process instance ID') },
    async (params) => {
      const tree = await adapter.getActivityInstanceTree(params.processInstanceId);
      return { content: [{ type: 'text' as const, text: JSON.stringify(tree, null, 2) }] };
    },
  );
}
