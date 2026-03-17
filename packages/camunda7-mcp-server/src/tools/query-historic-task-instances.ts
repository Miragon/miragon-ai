import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerQueryHistoricTaskInstances(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'query_historic_task_instances',
    'Query historic task instances. Shows completed and open user tasks from history.',
    {
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
      taskAssignee: z.string().optional().describe('Filter by assignee'),
      finished: z.boolean().optional().describe('Only finished tasks'),
      unfinished: z.boolean().optional().describe('Only unfinished tasks'),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(['taskId', 'activityInstanceId', 'processDefinitionId', 'processInstanceId', 'executionId', 'duration', 'endTime', 'startTime', 'taskName', 'taskDescription', 'assignee', 'owner', 'dueDate', 'followUpDate', 'deleteReason', 'taskDefinitionKey', 'priority', 'tenantId']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const tasks = await adapter.queryHistoricTaskInstances({
        processInstanceId: params.processInstanceId,
        processDefinitionKey: params.processDefinitionKey,
        taskAssignee: params.taskAssignee,
        finished: params.finished,
        unfinished: params.unfinished,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );
}
