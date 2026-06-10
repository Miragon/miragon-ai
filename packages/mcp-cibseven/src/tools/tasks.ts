import {
  listTasksInput,
  getTaskInput,
  claimTaskInput,
  unclaimTaskInput,
  completeTaskInput,
  setTaskAssigneeInput,
  getTaskVariablesInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getTasks,
  getTasksCount,
  getTask,
  claim,
  unclaim,
  complete,
  setAssignee,
  getTaskVariables,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerTaskTools(register: Register) {
  register({
    name: "camunda7_list_tasks",
    description:
      "List user tasks with optional filters. Each task carries ID, name, assignee, process info, and timestamps. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listTasksInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        assignee: args.assignee,
        candidateGroup: args.candidateGroup,
        processDefinitionKey: args.processDefinitionKey,
        processInstanceId: args.processInstanceId,
        unassigned: args.unassigned,
      }
      const [items, count] = await Promise.all([
        getTasks({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getTasksCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_get_task",
    description: "Get details of a single user task by ID.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getTaskInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => getTask({ client, path: { id: args.taskId } })),
  })

  register({
    name: "camunda7_claim_task",
    description: "Claim a user task for a specific user.",
    annotations: { openWorldHint: true },
    inputSchema: { ...claimTaskInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await claim({
        client,
        path: { id: args.taskId },
        body: { userId: args.userId },
      })
      return { success: true, taskId: args.taskId, userId: args.userId }
    }),
  })

  register({
    name: "camunda7_unclaim_task",
    description: "Unclaim (release) a user task, removing the current assignee.",
    annotations: { openWorldHint: true },
    inputSchema: { ...unclaimTaskInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await unclaim({ client, path: { id: args.taskId } })
      return { success: true, taskId: args.taskId }
    }),
  })

  register({
    name: "camunda7_complete_task",
    description: "Complete a user task by ID. Optionally set variables when completing.",
    annotations: { openWorldHint: true },
    inputSchema: { ...completeTaskInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
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
    }),
  })

  register({
    name: "camunda7_set_task_assignee",
    description: "Set the assignee of a user task.",
    annotations: { openWorldHint: true },
    inputSchema: { ...setTaskAssigneeInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await setAssignee({
        client,
        path: { id: args.taskId },
        body: { userId: args.userId },
      })
      return { success: true, taskId: args.taskId, userId: args.userId }
    }),
  })

  register({
    name: "camunda7_get_task_variables",
    description: "Get all variables of a user task.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getTaskVariablesInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getTaskVariables({ client, path: { id: args.taskId } }),
    ),
  })
}
