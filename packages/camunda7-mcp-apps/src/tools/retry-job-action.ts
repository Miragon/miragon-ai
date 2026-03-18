import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  title: 'Retry Job',
  description: 'Set retries on a failed job to trigger re-execution, then verify the incident resolved',
  annotations: { readOnlyHint: false },
  _meta: { ui: { visibility: ['app'] } },
};

export const schema = {
  jobId: z.string().describe('The job ID to retry'),
  retries: z.number().default(1).describe('Number of retries'),
  incidentId: z.string().optional().describe('Incident ID to verify resolution after retry'),
  processInstanceId: z.string().optional().describe('Process instance ID for incident lookup'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const adapter = getAdapter();
  await adapter.setJobRetries(args.jobId, args.retries);

  // If caller provided incident context, verify whether the incident resolved
  if (args.incidentId && args.processInstanceId) {
    // Give the engine a moment to process the retry
    await sleep(1500);

    const incidents = await adapter.listIncidents({
      processInstanceId: args.processInstanceId,
      maxResults: 100,
    });

    const stillExists = incidents.some((i) => i.id === args.incidentId);

    return {
      structuredContent: {
        success: true,
        jobId: args.jobId,
        resolved: !stillExists,
      },
    };
  }

  return { structuredContent: { success: true, jobId: args.jobId, resolved: null } };
}
