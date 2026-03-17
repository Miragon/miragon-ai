import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerSetJobRetries(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'set_job_retries',
    'Set the number of retries for a failed job. Setting retries > 0 will re-execute the job.',
    {
      jobId: z.string().describe('The job ID'),
      retries: z.number().int().min(0).describe('Number of retries to set'),
    },
    async (params) => {
      await adapter.setJobRetries(params.jobId, params.retries);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, jobId: params.jobId, retries: params.retries }, null, 2) }] };
    },
  );
}
