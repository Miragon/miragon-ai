import { z } from 'zod';
import type { AppToolConfig } from 'sunpeak';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'incident-panel',
  title: 'Incident Panel',
  description: 'Show all open incidents with error details and retry capability',
  annotations: { readOnlyHint: false },
};

export const schema = {
  processDefinitionId: z.string().optional().describe('Filter by process definition'),
  processInstanceId: z.string().optional().describe('Filter by process instance'),
  incidentType: z.string().optional().describe('Filter by incident type'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args) {
  const adapter = getAdapter();

  const incidents = await adapter.listIncidents({
    processDefinitionId: args.processDefinitionId,
    processInstanceId: args.processInstanceId,
    incidentType: args.incidentType,
    maxResults: 100,
    sortBy: 'incidentTimestamp',
    sortOrder: 'desc',
  });

  return {
    structuredContent: {
      incidents,
      totalCount: incidents.length,
    },
  };
}
