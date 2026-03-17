import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import type { VariableValue } from '@camunda7-mcp/shared';
import { z } from 'zod';

export function registerThrowSignal(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'throw_signal',
    'Throw a signal to trigger all matching signal catch events and signal start events.',
    {
      name: z.string().describe('The name of the signal'),
      variables: z.record(z.object({
        value: z.unknown(),
        type: z.string().optional(),
      })).optional().describe('Variables to set'),
    },
    async (params) => {
      await adapter.throwSignal({
        name: params.name,
        variables: params.variables as Record<string, VariableValue> | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, signalName: params.name }, null, 2) }] };
    },
  );
}
