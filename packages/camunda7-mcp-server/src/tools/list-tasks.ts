import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { listTasksSchema } from '@camunda7-mcp/shared';

export function registerListTasks(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_tasks',
    'List user tasks with optional filters. Returns task ID, name, assignee, process info, and timestamps.',
    listTasksSchema.shape,
    async (params) => {
      const tasks = await adapter.listTasks({
        assignee: params.assignee,
        candidateGroup: params.candidateGroup,
        processDefinitionKey: params.processDefinitionKey,
        processInstanceId: params.processInstanceId,
        unassigned: params.unassigned,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }],
      };
    },
  );
}
