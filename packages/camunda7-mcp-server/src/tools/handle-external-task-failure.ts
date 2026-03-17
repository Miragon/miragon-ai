import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerHandleExternalTaskFailure(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'handle_external_task_failure',
    'Report a failure for an external task. Sets the error message, remaining retries, and retry timeout.',
    {
      externalTaskId: z.string().describe('The ID of the external task'),
      workerId: z.string().describe('The ID of the worker that locked the task'),
      errorMessage: z.string().optional().describe('Error message describing the failure'),
      errorDetails: z.string().optional().describe('Detailed error information (e.g. stack trace)'),
      retries: z.number().int().min(0).optional().describe('Remaining retries (0 creates an incident)'),
      retryTimeout: z.number().int().min(0).optional().describe('Timeout in ms before the task can be retried'),
    },
    async (params) => {
      await adapter.handleExternalTaskFailure(params.externalTaskId, {
        workerId: params.workerId,
        errorMessage: params.errorMessage,
        errorDetails: params.errorDetails,
        retries: params.retries,
        retryTimeout: params.retryTimeout,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, externalTaskId: params.externalTaskId }) }],
      };
    },
  );
}
