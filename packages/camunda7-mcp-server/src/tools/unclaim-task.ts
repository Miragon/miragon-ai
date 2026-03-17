import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerUnclaimTask(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'unclaim_task',
    'Unclaim (release) a user task, removing the current assignee.',
    { taskId: z.string().describe('The task ID to unclaim') },
    async (params) => {
      await adapter.unclaimTask(params.taskId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, taskId: params.taskId }, null, 2) }] };
    },
  );
}
