import { z } from 'zod';

export const listProcessDefinitionsSchema = z.object({
  key: z.string().optional().describe('Filter by exact process definition key'),
  nameLike: z.string().optional().describe('Filter by name (substring match)'),
  latestVersion: z.boolean().optional().describe('Only return latest versions'),
  maxResults: z.number().int().positive().optional().default(20).describe('Maximum number of results'),
  sortBy: z.enum(['category', 'key', 'id', 'name', 'version', 'deploymentId', 'tenantId']).optional().describe('Sort field'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
});

export const startProcessInstanceSchema = z.object({
  processDefinitionKey: z.string().describe('The key of the process definition to start'),
  businessKey: z.string().optional().describe('Business key for correlation'),
  variables: z.record(z.object({
    value: z.unknown().describe('Variable value'),
    type: z.string().optional().describe('Variable type (String, Integer, Boolean, etc.)'),
  })).optional().describe('Process variables to set'),
});

export const listTasksSchema = z.object({
  assignee: z.string().optional().describe('Filter by assignee user ID'),
  candidateGroup: z.string().optional().describe('Filter by candidate group'),
  processDefinitionKey: z.string().optional().describe('Filter by process definition key'),
  processInstanceId: z.string().optional().describe('Filter by process instance ID'),
  unassigned: z.boolean().optional().describe('Only return unassigned tasks'),
  maxResults: z.number().int().positive().optional().default(20).describe('Maximum number of results'),
  sortBy: z.enum(['instanceId', 'dueDate', 'executionId', 'assignee', 'created', 'description', 'id', 'name', 'priority', 'taskDefinitionKey']).optional().describe('Sort field'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
});

export const completeTaskSchema = z.object({
  taskId: z.string().describe('The ID of the task to complete'),
  variables: z.record(z.object({
    value: z.unknown().describe('Variable value'),
    type: z.string().optional().describe('Variable type (String, Integer, Boolean, etc.)'),
  })).optional().describe('Variables to set when completing the task'),
});

export const getVariablesSchema = z.object({
  scope: z.enum(['process-instance', 'task']).describe('Whether to get variables from a process instance or task'),
  id: z.string().describe('The process instance ID or task ID'),
});

export type ListProcessDefinitionsInput = z.infer<typeof listProcessDefinitionsSchema>;
export type StartProcessInstanceInput = z.infer<typeof startProcessInstanceSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
export type GetVariablesInput = z.infer<typeof getVariablesSchema>;
