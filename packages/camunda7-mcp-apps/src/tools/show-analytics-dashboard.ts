import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'analytics-dashboard',
  title: 'Process Analytics Dashboard',
  description: 'Show aggregated process metrics and KPIs from history data',
};

export const schema = {
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
  startedAfter: z.string().optional().describe('Only instances started after this date (ISO 8601)'),
  startedBefore: z.string().optional().describe('Only instances started before this date (ISO 8601)'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();

  const [completed, running, incidents] = await Promise.all([
    adapter.queryHistoricProcessInstances({
      processDefinitionKey: args.processDefinitionKey,
      finished: true,
      startedAfter: args.startedAfter,
      startedBefore: args.startedBefore,
      maxResults: 1000,
      sortBy: 'startTime',
      sortOrder: 'desc',
    }),
    adapter.queryHistoricProcessInstances({
      processDefinitionKey: args.processDefinitionKey,
      unfinished: true,
      startedAfter: args.startedAfter,
      startedBefore: args.startedBefore,
      maxResults: 1000,
    }),
    adapter.listIncidents({
      maxResults: 100,
    }),
  ]);

  const durations = completed
    .filter(i => i.durationInMillis != null)
    .map(i => i.durationInMillis!);

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  return {
    structuredContent: {
      completedCount: completed.length,
      runningCount: running.length,
      incidentCount: incidents.length,
      avgDurationMs: avgDuration,
      completedInstances: completed.slice(0, 50),
      runningInstances: running.slice(0, 50),
    },
  };
}
