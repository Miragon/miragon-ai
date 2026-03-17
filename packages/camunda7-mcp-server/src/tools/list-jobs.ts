import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerListJobs(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_jobs',
    'List jobs (timers, async continuations) with optional filters.',
    {
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      withRetriesLeft: z.boolean().optional().describe('Only jobs with retries > 0'),
      noRetriesLeft: z.boolean().optional().describe('Only jobs with retries = 0 (failed)'),
      active: z.boolean().optional().describe('Only active jobs'),
      suspended: z.boolean().optional().describe('Only suspended jobs'),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(['jobId', 'executionId', 'processInstanceId', 'processDefinitionId', 'processDefinitionKey', 'jobPriority', 'jobRetries', 'jobDueDate', 'tenantId', 'createTime']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const jobs = await adapter.listJobs({
        processInstanceId: params.processInstanceId,
        processDefinitionKey: params.processDefinitionKey,
        withRetriesLeft: params.withRetriesLeft,
        noRetriesLeft: params.noRetriesLeft,
        active: params.active,
        suspended: params.suspended,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(jobs, null, 2) }] };
    },
  );
}
