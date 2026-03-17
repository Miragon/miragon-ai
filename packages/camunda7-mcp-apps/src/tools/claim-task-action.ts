import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  title: 'Claim Task',
  description: 'Claim a user task for the current user',
  annotations: { readOnlyHint: false },
  _meta: { ui: { visibility: ['app'] } },
};

export const schema = {
  taskId: z.string().describe('The task ID to claim'),
  userId: z.string().describe('The user ID to assign'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();
  await adapter.claimTask(args.taskId, args.userId);
  return { structuredContent: { success: true, taskId: args.taskId } };
}
