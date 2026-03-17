import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerSetTaskAssignee(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'set_task_assignee',
    'Set the assignee of a user task.',
    {
      taskId: z.string().describe('The task ID'),
      userId: z.string().describe('The user ID to set as assignee'),
    },
    async (params) => {
      await adapter.setTaskAssignee(params.taskId, params.userId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, taskId: params.taskId, userId: params.userId }, null, 2) }] };
    },
  );
}
