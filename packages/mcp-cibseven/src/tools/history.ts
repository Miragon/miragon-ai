import {
  queryHistoricProcessInstancesInput,
  queryHistoricActivityInstancesInput,
  queryHistoricTaskInstancesInput,
  queryHistoricVariableInstancesInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getHistoricProcessInstances,
  getHistoricProcessInstancesCount,
  getHistoricActivityInstances,
  getHistoricActivityInstancesCount,
  getHistoricTaskInstances,
  getHistoricTaskInstancesCount,
  getHistoricVariableInstances,
  getHistoricVariableInstancesCount,
} from "@miragon-ai/client-cibseven/sdk"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerHistoryTools(register: Register) {
  register({
    name: "camunda7_query_historic_process_instances",
    category: "history",
    description:
      "Query historic process instances (completed and running) with filters. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...queryHistoricProcessInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processDefinitionKey: args.processDefinitionKey,
        finished: args.finished,
        unfinished: args.unfinished,
        startedBefore: args.startedBefore,
        startedAfter: args.startedAfter,
      }
      const [items, count] = await Promise.all([
        getHistoricProcessInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getHistoricProcessInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_query_historic_activity_instances",
    category: "history",
    description:
      "Query historic activity instances, i.e. which BPMN activities were executed in a process instance. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...queryHistoricActivityInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processInstanceId: args.processInstanceId,
        activityType: args.activityType,
        finished: args.finished,
        unfinished: args.unfinished,
      }
      const [items, count] = await Promise.all([
        getHistoricActivityInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getHistoricActivityInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_query_historic_task_instances",
    category: "history",
    description:
      "Query historic task instances (completed and open user tasks). Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...queryHistoricTaskInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processInstanceId: args.processInstanceId,
        processDefinitionKey: args.processDefinitionKey,
        taskAssignee: args.taskAssignee,
        finished: args.finished,
        unfinished: args.unfinished,
      }
      const [items, count] = await Promise.all([
        getHistoricTaskInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getHistoricTaskInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_query_historic_variable_instances",
    category: "history",
    description:
      "Query historic variable instances, i.e. variable values from process history. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...queryHistoricVariableInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processInstanceId: args.processInstanceId,
        variableName: args.variableName,
        variableNameLike: args.variableNameLike,
      }
      const [items, count] = await Promise.all([
        getHistoricVariableInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getHistoricVariableInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })
}
