import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'history-timeline',
  title: 'History Timeline',
  description: 'Show activity timeline for a completed or running process instance',
};

export const schema = {
  processInstanceId: z.string().describe('The process instance ID'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();

  const [activities, processInstance] = await Promise.all([
    adapter.queryHistoricActivityInstances({
      processInstanceId: args.processInstanceId,
      sortBy: 'startTime',
      sortOrder: 'asc',
      maxResults: 500,
    }),
    adapter.queryHistoricProcessInstances({
      processDefinitionKey: undefined,
      maxResults: 1,
    }).then(instances => instances.find(i => i.id === args.processInstanceId) ?? null),
  ]);

  return {
    structuredContent: {
      processInstance,
      activities,
      totalActivities: activities.length,
    },
  };
}
