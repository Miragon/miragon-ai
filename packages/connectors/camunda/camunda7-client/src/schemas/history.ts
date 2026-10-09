import { z } from "zod"
import { engineDateParam, firstResultParam, sortOrderParam } from "./shared.js"

export const queryHistoricProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  finished: z.boolean().optional().describe("Only finished instances"),
  unfinished: z.boolean().optional().describe("Only unfinished (running) instances"),
  startedBefore: engineDateParam("Started before"),
  startedAfter: engineDateParam("Started after"),
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
  sortOrder: sortOrderParam,
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
  sortOrder: sortOrderParam,
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
  sortOrder: sortOrderParam,
})

export const queryHistoricVariableInstancesInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  variableName: z.string().optional().describe("Filter by exact variable name"),
  variableNameLike: z.string().optional().describe("Filter by variable name pattern"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(50),
  sortBy: z.enum(["instanceId", "variableName", "tenantId"]).optional(),
  sortOrder: sortOrderParam,
})
