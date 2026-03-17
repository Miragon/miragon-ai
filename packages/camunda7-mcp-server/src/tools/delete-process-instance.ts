import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerDeleteProcessInstance(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'delete_process_instance',
    'Delete (cancel) a running process instance by ID. This action is irreversible.',
    { processInstanceId: z.string().describe('The process instance ID to delete') },
    async (params) => {
      await adapter.deleteProcessInstance(params.processInstanceId);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, processInstanceId: params.processInstanceId }, null, 2) }] };
    },
  );
}
