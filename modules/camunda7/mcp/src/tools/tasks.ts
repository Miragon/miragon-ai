import { z } from "zod"
import type { Client } from "@automation-mcp/client-camunda7"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getTasks,
  getTask,
  claim,
  unclaim,
  complete,
  setAssignee,
  getTaskVariables,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

const taskVariableSchema = z
  .record(
    z.string(),
    z.object({
      value: z.unknown().describe("Variable value"),
      type: z.string().optional().describe("Variable type (String, Integer, Boolean, etc.)"),
    }),
  )
  .describe("Variables to set when completing the task")

export function registerTaskTools(register: Register) {
  register({
    name: "camunda7_list_tasks",
    description:
      "List user tasks with optional filters. Returns task ID, name, assignee, process info, and timestamps.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
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
          "executionId",
          "assignee",
          "created",
          "description",
          "id",
          "name",
          "priority",
          "taskDefinitionKey",
        ])
        .optional()
        .describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    },
    handler: async (client, args) =>
      getTasks({
        client,
        query: {
          assignee: args.assignee,
          candidateGroup: args.candidateGroup,
          processDefinitionKey: args.processDefinitionKey,
          processInstanceId: args.processInstanceId,
          unassigned: args.unassigned,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_get_task",
    description: "Get details of a single user task by ID.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { taskId: z.string().describe("The task ID") },
    handler: async (client, args) => getTask({ client, path: { id: args.taskId } }),
  })

  register({
    name: "camunda7_claim_task",
    description: "Claim a user task for a specific user.",
    annotations: { openWorldHint: true },
    inputSchema: {
      taskId: z.string().describe("The task ID to claim"),
      userId: z.string().describe("The user ID to assign the task to"),
    },
    handler: async (client, args) => {
      await claim({
        client,
        path: { id: args.taskId },
        body: { userId: args.userId },
      })
      return { success: true, taskId: args.taskId, userId: args.userId }
    },
  })

  register({
    name: "camunda7_unclaim_task",
    description: "Unclaim (release) a user task, removing the current assignee.",
    annotations: { openWorldHint: true },
    inputSchema: { taskId: z.string().describe("The task ID to unclaim") },
    handler: async (client, args) => {
      await unclaim({ client, path: { id: args.taskId } })
      return { success: true, taskId: args.taskId }
    },
  })

  register({
    name: "camunda7_complete_task",
    description: "Complete a user task by ID. Optionally set variables when completing.",
    annotations: { openWorldHint: true },
    inputSchema: {
      taskId: z.string().describe("The ID of the task to complete"),
      variables: taskVariableSchema.optional(),
    },
    handler: async (client, args) => {
      await complete({
        client,
        path: { id: args.taskId },
        body: {
          variables: args.variables as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
        },
      })
      return { success: true, taskId: args.taskId }
    },
  })

  register({
    name: "camunda7_set_task_assignee",
    description: "Set the assignee of a user task.",
    annotations: { openWorldHint: true },
    inputSchema: {
      taskId: z.string().describe("The task ID"),
      userId: z.string().describe("The user ID to set as assignee"),
    },
    handler: async (client, args) => {
      await setAssignee({
        client,
        path: { id: args.taskId },
        body: { userId: args.userId },
      })
      return { success: true, taskId: args.taskId, userId: args.userId }
    },
  })

  register({
    name: "camunda7_get_task_variables",
    description: "Get all variables of a user task.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { taskId: z.string().describe("The task ID") },
    handler: async (client, args) => getTaskVariables({ client, path: { id: args.taskId } }),
  })
}
