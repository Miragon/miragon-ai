import type { Client } from "@miragon-ai/client-cibseven"
import {
  queryHistoricProcessInstancesInput,
  queryHistoricActivityInstancesInput,
  queryHistoricTaskInstancesInput,
  queryHistoricVariableInstancesInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getHistoricProcessInstances,
  getHistoricActivityInstances,
  getHistoricTaskInstances,
  getHistoricVariableInstances,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerHistoryTools(register: Register) {
  register({
    name: "camunda7_query_historic_process_instances",
    description:
      "Query historic process instances with filters. Returns completed and running instances from history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: queryHistoricProcessInstancesInput.shape,
    handler: async (client, args) =>
      getHistoricProcessInstances({
        client,
        query: {
          processDefinitionKey: args.processDefinitionKey,
          finished: args.finished,
          unfinished: args.unfinished,
          startedBefore: args.startedBefore,
          startedAfter: args.startedAfter,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_activity_instances",
    description:
      "Query historic activity instances. Shows which BPMN activities were executed in a process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: queryHistoricActivityInstancesInput.shape,
    handler: async (client, args) =>
      getHistoricActivityInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          activityType: args.activityType,
          finished: args.finished,
          unfinished: args.unfinished,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_task_instances",
    description: "Query historic task instances. Shows completed and open user tasks from history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: queryHistoricTaskInstancesInput.shape,
    handler: async (client, args) =>
      getHistoricTaskInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          processDefinitionKey: args.processDefinitionKey,
          taskAssignee: args.taskAssignee,
          finished: args.finished,
          unfinished: args.unfinished,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_query_historic_variable_instances",
    description: "Query historic variable instances. Shows variable values from process history.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: queryHistoricVariableInstancesInput.shape,
    handler: async (client, args) =>
      getHistoricVariableInstances({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          variableName: args.variableName,
          variableNameLike: args.variableNameLike,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })
}
