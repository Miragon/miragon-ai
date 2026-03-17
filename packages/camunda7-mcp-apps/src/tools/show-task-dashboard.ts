import { z } from 'zod';
import type { AppToolConfig, ToolHandlerExtra } from 'sunpeak/mcp';
import { getAdapter } from '../lib/adapter.js';

export const tool: AppToolConfig = {
  resource: 'task-dashboard',
  title: 'Camunda Task Dashboard',
  description: 'Show open user tasks with filtering, claim and complete actions',
  annotations: { readOnlyHint: false },
};

export const schema = {
  assignee: z.string().optional().describe('Filter by assigned user'),
  candidateGroup: z.string().optional().describe('Filter by candidate group'),
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
  maxResults: z.number().optional().default(50).describe('Max tasks to return'),
};

type Args = z.infer<z.ZodObject<typeof schema>>;

export default async function (args: Args, _extra: ToolHandlerExtra) {
  const adapter = getAdapter();

  const tasks = await adapter.listTasks({
    assignee: args.assignee,
    candidateGroup: args.candidateGroup,
    processDefinitionKey: args.processDefinitionKey,
    maxResults: args.maxResults,
    sortBy: 'created',
    sortOrder: 'desc',
  });

  return {
    structuredContent: {
      tasks,
      totalCount: tasks.length,
      filters: {
        assignee: args.assignee,
        candidateGroup: args.candidateGroup,
        processDefinitionKey: args.processDefinitionKey,
      },
    },
  };
}
