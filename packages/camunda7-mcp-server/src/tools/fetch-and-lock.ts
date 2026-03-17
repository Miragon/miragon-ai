import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerFetchAndLock(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'fetch_and_lock',
    'Fetch and lock external tasks for a given worker. Returns tasks that match the specified topic(s) and locks them for processing.',
    {
      workerId: z.string().describe('The ID of the worker to lock tasks for'),
      maxTasks: z.number().int().positive().default(10).describe('Maximum number of tasks to fetch'),
      topics: z.array(z.object({
        topicName: z.string().describe('Topic name to subscribe to'),
        lockDuration: z.number().int().positive().default(300000).describe('Lock duration in milliseconds'),
        variables: z.array(z.string()).optional().describe('Variable names to include in the response'),
      })).describe('Topics to subscribe to'),
    },
    async (params) => {
      const tasks = await adapter.fetchAndLock({
        workerId: params.workerId,
        maxTasks: params.maxTasks,
        topics: params.topics,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );
}
