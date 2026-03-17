import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  title: 'Retry Job',
  description: 'Set retries on a failed job to trigger re-execution',
  annotations: { readOnlyHint: false },
  _meta: { ui: { visibility: ['app'] } },
};

export const schema = {
  jobId: z.string().describe('The job ID to retry'),
  retries: z.number().default(1).describe('Number of retries'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();
  await adapter.setJobRetries(args.jobId, args.retries);
  return { structuredContent: { success: true, jobId: args.jobId } };
}
