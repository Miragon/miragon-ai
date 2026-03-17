import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  title: 'Complete Task',
  description: 'Complete a user task with optional variables',
  annotations: { readOnlyHint: false },
  _meta: { ui: { visibility: ['app'] } },
};

export const schema = {
  taskId: z.string().describe('The task ID to complete'),
  variables: z.record(z.object({
    value: z.unknown(),
    type: z.string().optional(),
  })).optional().describe('Variables to set when completing'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const adapter = getAdapter();
  await adapter.completeTask(args.taskId, args.variables as any);
  return { structuredContent: { success: true, taskId: args.taskId } };
}
