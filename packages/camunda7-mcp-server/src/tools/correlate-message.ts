import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import type { VariableValue } from '@camunda7-mcp/shared';
import { z } from 'zod';

export function registerCorrelateMessage(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'correlate_message',
    'Correlate a message to trigger a message catch event or start a message start event.',
    {
      messageName: z.string().describe('The name of the message'),
      businessKey: z.string().optional().describe('Business key to correlate with'),
      correlationKeys: z.record(z.object({
        value: z.unknown(),
        type: z.string().optional(),
      })).optional().describe('Correlation keys to match'),
      processVariables: z.record(z.object({
        value: z.unknown(),
        type: z.string().optional(),
      })).optional().describe('Variables to set on the process'),
      resultEnabled: z.boolean().optional().default(true).describe('Return correlation result'),
    },
    async (params) => {
      const result = await adapter.correlateMessage({
        messageName: params.messageName,
        businessKey: params.businessKey,
        correlationKeys: params.correlationKeys as Record<string, VariableValue> | undefined,
        processVariables: params.processVariables as Record<string, VariableValue> | undefined,
        resultEnabled: params.resultEnabled,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
