import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerClaimTask(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'claim_task',
    'Claim a user task for a specific user.',
    {
      taskId: z.string().describe('The task ID to claim'),
      userId: z.string().describe('The user ID to assign the task to'),
    },
    async (params) => {
      await adapter.claimTask(params.taskId, params.userId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, taskId: params.taskId, userId: params.userId }, null, 2) }] };
    },
  );
}
