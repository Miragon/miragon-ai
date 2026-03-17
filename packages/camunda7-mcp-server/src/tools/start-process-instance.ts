import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { startProcessInstanceSchema } from '@camunda7-mcp/shared';
import type { VariableValue } from '@camunda7-mcp/shared';

export function registerStartProcessInstance(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'start_process_instance',
    'Start a new process instance by process definition key. Optionally set a business key and initial variables.',
    startProcessInstanceSchema.shape,
    async (params) => {
      const instance = await adapter.startProcessInstance(params.processDefinitionKey, {
        businessKey: params.businessKey,
        variables: params.variables as Record<string, VariableValue> | undefined,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(instance, null, 2) }],
      };
    },
  );
}
