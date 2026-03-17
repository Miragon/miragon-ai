import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerListIncidents(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'list_incidents',
    'List incidents (errors) in the engine. Shows failed jobs, external task failures, etc.',
    {
      processInstanceId: z.string().optional().describe('Filter by process instance ID'),
      processDefinitionId: z.string().optional().describe('Filter by process definition ID'),
      incidentType: z.string().optional().describe('Filter by incident type (e.g. failedJob, failedExternalTask)'),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(['incidentId', 'incidentMessage', 'incidentTimestamp', 'incidentType', 'executionId', 'activityId', 'processInstanceId', 'processDefinitionId', 'causeIncidentId', 'rootCauseIncidentId', 'configuration', 'tenantId']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    },
    async (params) => {
      const incidents = await adapter.listIncidents({
        processInstanceId: params.processInstanceId,
        processDefinitionId: params.processDefinitionId,
        incidentType: params.incidentType,
        maxResults: params.maxResults,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(incidents, null, 2) }] };
    },
  );
}
