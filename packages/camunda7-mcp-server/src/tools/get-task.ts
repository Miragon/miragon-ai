import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerGetTask(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'get_task',
    'Get details of a single user task by ID.',
    { taskId: z.string().describe('The task ID') },
    async (params) => {
      const task = await adapter.getTask(params.taskId);
      return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
    },
  );
}
