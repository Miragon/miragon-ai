import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerSetVariable(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'set_variable',
    'Set a single variable on a process instance.',
    {
      processInstanceId: z.string().describe('The process instance ID'),
      variableName: z.string().describe('The variable name'),
      value: z.unknown().describe('The variable value'),
      type: z.string().optional().describe('The variable type (String, Integer, Boolean, etc.)'),
    },
    async (params) => {
      await adapter.setVariable(params.processInstanceId, params.variableName, {
        value: params.value,
        type: params.type,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, processInstanceId: params.processInstanceId, variableName: params.variableName }, null, 2) }] };
    },
  );
}
