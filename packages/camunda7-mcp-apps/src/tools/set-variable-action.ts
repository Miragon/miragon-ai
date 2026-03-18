import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  title: 'Set Variable',
  description: 'Set a process variable and verify the change was applied',
  annotations: { readOnlyHint: false },
  _meta: { ui: { visibility: ['app'] } },
};

export const schema = {
  processInstanceId: z.string().describe('The process instance ID'),
  variableName: z.string().describe('The variable name to set'),
  value: z.unknown().describe('The new variable value'),
  type: z.string().optional().describe('Variable type (String, Integer, Boolean, Json, etc.)'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const adapter = getAdapter();

  await adapter.setVariable(args.processInstanceId, args.variableName, {
    value: args.value,
    type: args.type,
  });

  // Re-read variables to verify the change was applied
  const variables = await adapter.getVariables('process-instance', args.processInstanceId);
  const current = variables[args.variableName];

  const verified = current !== undefined
    && JSON.stringify(current.value) === JSON.stringify(args.value);

  return {
    structuredContent: {
      success: true,
      variableName: args.variableName,
      verified,
      currentValue: current ?? null,
    },
  };
}
