import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerQueryHistoricActivityInstances(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'query_historic_activity_instances',
    'Query historic activity instances. Shows which BPMN activities were executed in a process instance.',
    {
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      activityType: z.string().optional().describe('Filter by activity type (e.g. userTask, serviceTask)'),
      finished: z.boolean().optional().describe('Only finished activities'),
      unfinished: z.boolean().optional().describe('Only unfinished activities'),
      maxResults: z.number().int().positive().optional().default(50),
      sortBy: z.enum(['activityInstanceId', 'instanceId', 'executionId', 'activityId', 'activityName', 'activityType', 'startTime', 'endTime', 'duration', 'tenantId']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const activities = await adapter.queryHistoricActivityInstances({
        processInstanceId: params.processInstanceId,
        activityType: params.activityType,
        finished: params.finished,
        unfinished: params.unfinished,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(activities, null, 2) }] };
    },
  );
}
