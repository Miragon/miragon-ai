import { z } from "zod"
import { firstResultParam } from "./shared.js"

export const queryHistoricProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  finished: z.boolean().optional().describe("Only finished instances"),
  unfinished: z.boolean().optional().describe("Only unfinished (running) instances"),
  startedBefore: z.string().optional().describe("Started before date (ISO 8601)"),
  startedAfter: z.string().optional().describe("Started after date (ISO 8601)"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z
    .enum([
      "instanceId",
      "definitionId",
      "definitionKey",
      "definitionName",
      "startTime",
      "endTime",
      "duration",
      "tenantId",
      "businessKey",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const queryHistoricActivityInstancesInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  activityType: z
    .string()
    .optional()
    .describe("Filter by activity type (e.g. userTask, serviceTask)"),
  finished: z.boolean().optional().describe("Only finished activities"),
  unfinished: z.boolean().optional().describe("Only unfinished activities"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(50),
  sortBy: z
    .enum([
      "activityInstanceId",
      "instanceId",
      "executionId",
      "activityId",
      "activityName",
      "activityType",
      "startTime",
      "endTime",
      "duration",
      "tenantId",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const queryHistoricTaskInstancesInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  taskAssignee: z.string().optional().describe("Filter by assignee"),
  finished: z.boolean().optional().describe("Only finished tasks"),
  unfinished: z.boolean().optional().describe("Only unfinished tasks"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z
    .enum([
      "taskId",
      "activityInstanceId",
      "processDefinitionId",
      "processInstanceId",
      "executionId",
      "duration",
      "endTime",
      "startTime",
      "taskName",
      "taskDescription",
      "assignee",
      "owner",
      "dueDate",
      "followUpDate",
      "deleteReason",
      "taskDefinitionKey",
      "priority",
      "tenantId",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const queryHistoricVariableInstancesInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  variableName: z.string().optional().describe("Filter by exact variable name"),
  variableNameLike: z.string().optional().describe("Filter by variable name pattern"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(50),
  sortBy: z.enum(["instanceId", "variableName", "tenantId"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})
