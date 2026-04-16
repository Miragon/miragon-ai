import { z } from "zod"
import { variableSchema } from "./shared.js"

export const listTasksInput = z.object({
  assignee: z.string().optional().describe("Filter by assignee user ID"),
  candidateGroup: z.string().optional().describe("Filter by candidate group"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  unassigned: z.boolean().optional().describe("Only return unassigned tasks"),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .default(20)
    .describe("Maximum number of results"),
  sortBy: z
    .enum([
      "instanceId",
      "dueDate",
      "assignee",
      "created",
      "lastUpdated",
      "description",
      "id",
      "name",
      "priority",
    ])
    .optional()
    .describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
})

export const getTaskInput = z.object({
  taskId: z.string().describe("The task ID"),
})

export const claimTaskInput = z.object({
  taskId: z.string().describe("The task ID to claim"),
  userId: z.string().describe("The user ID to assign the task to"),
})

export const unclaimTaskInput = z.object({
  taskId: z.string().describe("The task ID to unclaim"),
})

export const completeTaskInput = z.object({
  taskId: z.string().describe("The ID of the task to complete"),
  variables: variableSchema.optional().describe("Variables to set when completing the task"),
})

export const setTaskAssigneeInput = z.object({
  taskId: z.string().describe("The task ID"),
  userId: z.string().describe("The user ID to set as assignee"),
})

export const getTaskVariablesInput = z.object({
  taskId: z.string().describe("The task ID"),
})
