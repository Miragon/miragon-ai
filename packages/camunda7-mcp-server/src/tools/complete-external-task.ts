import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import type { VariableValue } from '@camunda7-mcp/shared';
import { z } from 'zod';

export function registerCompleteExternalTask(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'complete_external_task',
    'Complete an external task that was previously fetched and locked. Optionally set variables.',
    {
      externalTaskId: z.string().describe('The ID of the external task to complete'),
      workerId: z.string().describe('The ID of the worker that locked the task'),
      variables: z.record(z.string(), z.object({
        value: z.unknown(),
        type: z.string().optional(),
      })).optional().describe('Variables to set when completing the task'),
    },
    async (params) => {
      await adapter.completeExternalTask(params.externalTaskId, {
        workerId: params.workerId,
        variables: params.variables as Record<string, VariableValue> | undefined,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, externalTaskId: params.externalTaskId }) }],
      };
    },
  );
}
