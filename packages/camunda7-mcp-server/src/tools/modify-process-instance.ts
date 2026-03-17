import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerModifyProcessInstance(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'modify_process_instance',
    'Modify a running process instance by moving tokens. Supports cancel, startBeforeActivity, startAfterActivity, and startTransition instructions.',
    {
      processInstanceId: z.string().describe('The ID of the process instance to modify'),
      skipCustomListeners: z.boolean().optional().describe('Skip execution of custom listeners'),
      skipIoMappings: z.boolean().optional().describe('Skip execution of input/output mappings'),
      instructions: z.array(z.object({
        type: z.enum(['cancel', 'startBeforeActivity', 'startAfterActivity', 'startTransition']).describe('Instruction type'),
        activityId: z.string().optional().describe('Activity ID to start before/after or cancel'),
        transitionId: z.string().optional().describe('Transition ID for startTransition'),
        activityInstanceId: z.string().optional().describe('Activity instance ID to cancel'),
        transitionInstanceId: z.string().optional().describe('Transition instance ID to cancel'),
        ancestorActivityInstanceId: z.string().optional().describe('Ancestor activity instance ID'),
      })).describe('Modification instructions'),
    },
    async (params) => {
      await adapter.modifyProcessInstance(params.processInstanceId, {
        skipCustomListeners: params.skipCustomListeners,
        skipIoMappings: params.skipIoMappings,
        instructions: params.instructions,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, processInstanceId: params.processInstanceId }) }],
      };
    },
  );
}
