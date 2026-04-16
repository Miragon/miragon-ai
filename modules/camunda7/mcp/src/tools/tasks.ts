import type { Client } from "@miragon-ai/client-camunda7"
import {
  listTasksInput,
  getTaskInput,
  claimTaskInput,
  unclaimTaskInput,
  completeTaskInput,
  setTaskAssigneeInput,
  getTaskVariablesInput,
} from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getTasks,
  getTask,
  claim,
  unclaim,
  complete,
  setAssignee,
  getTaskVariables,
} from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerTaskTools(register: Register) {
  register({
    name: "camunda7_list_tasks",
    description:
      "List user tasks with optional filters. Returns task ID, name, assignee, process info, and timestamps.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listTasksInput.shape,
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
    inputSchema: getTaskInput.shape,
    handler: async (client, args) => getTask({ client, path: { id: args.taskId } }),
  })

  register({
    name: "camunda7_claim_task",
    description: "Claim a user task for a specific user.",
    annotations: { openWorldHint: true },
    inputSchema: claimTaskInput.shape,
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
    inputSchema: unclaimTaskInput.shape,
    handler: async (client, args) => {
      await unclaim({ client, path: { id: args.taskId } })
      return { success: true, taskId: args.taskId }
    },
  })

  register({
    name: "camunda7_complete_task",
    description: "Complete a user task by ID. Optionally set variables when completing.",
    annotations: { openWorldHint: true },
    inputSchema: completeTaskInput.shape,
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
    inputSchema: setTaskAssigneeInput.shape,
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
    inputSchema: getTaskVariablesInput.shape,
    handler: async (client, args) => getTaskVariables({ client, path: { id: args.taskId } }),
  })
}
