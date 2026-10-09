import { z } from "zod"
import {
  engineDateParam,
  firstResultParam,
  flagParam,
  likeParam,
  sortOrderParam,
} from "./shared.js"

/** finished/unfinished — complementary engine flags (`complementaryFlags`). */
const finishedFlags = (things: string) => ({
  finished: flagParam(`true = only finished ${things}, false = only unfinished`),
  unfinished: flagParam(`true = only unfinished ${things}, false = only finished`),
})

/** Start/end time windows of a historic query; ISO 8601 in, engine format out. */
const timeWindow = {
  startedAfter: engineDateParam("Started after"),
  startedBefore: engineDateParam("Started before"),
  finishedAfter: engineDateParam("Finished after"),
  finishedBefore: engineDateParam("Finished before"),
}

export const queryHistoricProcessInstancesInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKey: z.string().optional().describe("Filter by exact business key"),
  businessKeyLike: likeParam("Filter by business key"),
  ...finishedFlags("instances"),
  withIncidents: flagParam("true = only instances that had an incident (open or resolved)"),
  incidentStatus: z
    .enum(["open", "resolved"])
    .optional()
    .describe("Only instances with an incident in this status"),
  ...timeWindow,
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
  processDefinitionId: z
    .string()
    .optional()
    .describe("Filter by process definition ID (this engine query has no key filter)"),
  activityId: z.string().optional().describe("Filter by activity ID (the BPMN element id)"),
  activityType: z
    .string()
    .optional()
    .describe("Filter by activity type (e.g. userTask, serviceTask)"),
  ...finishedFlags("activities"),
  canceled: flagParam("true = only canceled activities"),
  ...timeWindow,
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
  assignee: z.string().optional().describe("Filter by assignee user ID"),
  ...finishedFlags("tasks"),
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
  variableNameLike: likeParam("Filter by variable name"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(50),
  sortBy: z.enum(["instanceId", "variableName", "tenantId"]).optional(),
  sortOrder: sortOrderParam,
})
