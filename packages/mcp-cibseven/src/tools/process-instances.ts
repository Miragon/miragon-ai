import {
  startProcessInstanceInput,
  listProcessInstancesInput,
  getProcessInstanceInput,
  getActivityInstanceTreeInput,
  deleteProcessInstanceInput,
  modifyProcessInstanceInput,
  getProcessInstanceVariablesInput,
  setProcessInstanceVariableInput,
  setProcessInstanceSuspensionInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  startProcessInstanceByKey,
  getProcessInstances,
  getProcessInstancesCount,
  getProcessInstance,
  deleteProcessInstance,
  modifyProcessInstance,
  getActivityInstanceTree,
  getProcessInstanceVariables,
  setProcessInstanceVariable,
  updateSuspensionStateById,
} from "@miragon-ai/client-cibseven/sdk"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerProcessInstanceTools(register: Register) {
  register({
    name: "camunda7_start_process_instance",
    category: "process-instances",
    description:
      "Start a new process instance by process definition key. Optionally set a business key and initial variables.",
    annotations: { openWorldHint: true },
    inputSchema: { ...startProcessInstanceInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      startProcessInstanceByKey({
        client,
        path: { key: args.processDefinitionKey },
        body: {
          businessKey: args.businessKey,
          variables: args.variables as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
        },
      }),
    ),
  })

  register({
    name: "camunda7_list_process_instances",
    category: "process-instances",
    description:
      "List running process instances with optional filters. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listProcessInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processDefinitionKey: args.processDefinitionKey,
        businessKey: args.businessKey,
        active: args.active,
        suspended: args.suspended,
      }
      const [items, count] = await Promise.all([
        getProcessInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getProcessInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_get_process_instance",
    category: "process-instances",
    description: "Get details of a single process instance by ID.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getProcessInstanceInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getProcessInstance({ client, path: { id: args.processInstanceId } }),
    ),
  })

  register({
    name: "camunda7_get_activity_instance_tree",
    category: "process-instances",
    description:
      "Get the activity instance tree of a running process instance. Shows which activities are currently active.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getActivityInstanceTreeInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getActivityInstanceTree({ client, path: { id: args.processInstanceId } }),
    ),
  })

  register({
    name: "camunda7_delete_process_instance",
    category: "process-instances",
    description: "Delete (cancel) a running process instance by ID. This action is irreversible.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...deleteProcessInstanceInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await deleteProcessInstance({ client, path: { id: args.processInstanceId } })
      return { success: true, processInstanceId: args.processInstanceId }
    }),
  })

  register({
    name: "camunda7_modify_process_instance",
    category: "process-instances",
    description:
      "Modify a running process instance by moving tokens. Supports cancel, startBeforeActivity, startAfterActivity, and startTransition instructions.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...modifyProcessInstanceInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await modifyProcessInstance({
        client,
        path: { id: args.processInstanceId },
        body: {
          skipCustomListeners: args.skipCustomListeners,
          skipIoMappings: args.skipIoMappings,
          instructions: args.instructions,
        },
      })
      return { success: true, processInstanceId: args.processInstanceId }
    }),
  })

  register({
    name: "camunda7_get_process_instance_variables",
    category: "process-instances",
    description: "Get all variables of a process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getProcessInstanceVariablesInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getProcessInstanceVariables({ client, path: { id: args.processInstanceId } }),
    ),
  })

  register({
    name: "camunda7_set_process_instance_variable",
    category: "process-instances",
    description: "Set a single variable on a process instance.",
    annotations: { openWorldHint: true },
    inputSchema: { ...setProcessInstanceVariableInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await setProcessInstanceVariable({
        client,
        path: { id: args.processInstanceId, varName: args.variableName },
        body: { value: args.value, type: args.type },
      })
      return {
        success: true,
        processInstanceId: args.processInstanceId,
        variableName: args.variableName,
      }
    }),
  })

  register({
    name: "camunda7_set_process_instance_suspension",
    category: "process-instances",
    description:
      "Set the suspension state of a process instance. suspended=true suspends it (jobs, timers, and message correlations are frozen); suspended=false activates (unsuspends) it again.",
    annotations: { openWorldHint: true },
    inputSchema: { ...setProcessInstanceSuspensionInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await updateSuspensionStateById({
        client,
        path: { id: args.processInstanceId },
        body: { suspended: args.suspended },
      })
      return {
        success: true,
        processInstanceId: args.processInstanceId,
        suspended: args.suspended,
      }
    }),
  })
}
