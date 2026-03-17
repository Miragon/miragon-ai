import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerGetProcessInstance(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'get_process_instance',
    'Get details of a single process instance by ID.',
    { processInstanceId: z.string().describe('The process instance ID') },
    async (params) => {
      const instance = await adapter.getProcessInstance(params.processInstanceId);
      return { content: [{ type: 'text' as const, text: JSON.stringify(instance, null, 2) }] };
    },
  );
}
