import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { completeTaskSchema } from '@camunda7-mcp/shared';
import type { VariableValue } from '@camunda7-mcp/shared';

export function registerCompleteTask(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'complete_task',
    'Complete a user task by ID. Optionally set variables when completing.',
    completeTaskSchema.shape,
    async (params) => {
      await adapter.completeTask(params.taskId, params.variables as Record<string, VariableValue> | undefined);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, taskId: params.taskId }, null, 2) }],
      };
    },
  );
}
