import type { Client } from "@miragon-ai/client-camunda7"
import {
  startProcessInstanceInput,
  listProcessInstancesInput,
  getProcessInstanceInput,
  getActivityInstanceTreeInput,
  deleteProcessInstanceInput,
  modifyProcessInstanceInput,
  getProcessInstanceVariablesInput,
  setProcessInstanceVariableInput,
  suspendProcessInstanceInput,
  activateProcessInstanceInput,
} from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  startProcessInstanceByKey,
  getProcessInstances,
  getProcessInstance,
  deleteProcessInstance,
  modifyProcessInstance,
  getActivityInstanceTree,
  getProcessInstanceVariables,
  setProcessInstanceVariable,
  updateSuspensionStateById,
} from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerProcessInstanceTools(register: Register) {
  register({
    name: "camunda7_start_process_instance",
    description:
      "Start a new process instance by process definition key. Optionally set a business key and initial variables.",
    annotations: { openWorldHint: true },
    inputSchema: startProcessInstanceInput.shape,
    handler: async (client, args) =>
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
  })

  register({
    name: "camunda7_list_process_instances",
    description: "List running process instances with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listProcessInstancesInput.shape,
    handler: async (client, args) =>
      getProcessInstances({
        client,
        query: {
          processDefinitionKey: args.processDefinitionKey,
          businessKey: args.businessKey,
          active: args.active,
          suspended: args.suspended,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_get_process_instance",
    description: "Get details of a single process instance by ID.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getProcessInstanceInput.shape,
    handler: async (client, args) =>
      getProcessInstance({ client, path: { id: args.processInstanceId } }),
  })

  register({
    name: "camunda7_get_activity_instance_tree",
    description:
      "Get the activity instance tree of a running process instance. Shows which activities are currently active.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getActivityInstanceTreeInput.shape,
    handler: async (client, args) =>
      getActivityInstanceTree({ client, path: { id: args.processInstanceId } }),
  })

  register({
    name: "camunda7_delete_process_instance",
    description: "Delete (cancel) a running process instance by ID. This action is irreversible.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: deleteProcessInstanceInput.shape,
    handler: async (client, args) => {
      await deleteProcessInstance({ client, path: { id: args.processInstanceId } })
      return { success: true, processInstanceId: args.processInstanceId }
    },
  })

  register({
    name: "camunda7_modify_process_instance",
    description:
      "Modify a running process instance by moving tokens. Supports cancel, startBeforeActivity, startAfterActivity, and startTransition instructions.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: modifyProcessInstanceInput.shape,
    handler: async (client, args) => {
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
    },
  })

  register({
    name: "camunda7_get_process_instance_variables",
    description: "Get all variables of a process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getProcessInstanceVariablesInput.shape,
    handler: async (client, args) =>
      getProcessInstanceVariables({ client, path: { id: args.processInstanceId } }),
  })

  register({
    name: "camunda7_set_process_instance_variable",
    description: "Set a single variable on a process instance.",
    annotations: { openWorldHint: true },
    inputSchema: setProcessInstanceVariableInput.shape,
    handler: async (client, args) => {
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
    },
  })

  register({
    name: "camunda7_suspend_process_instance",
    description:
      "Suspend a running process instance. Jobs, timers, and message correlations on the instance are frozen until it is activated again.",
    annotations: { openWorldHint: true },
    inputSchema: suspendProcessInstanceInput.shape,
    handler: async (client, args) => {
      await updateSuspensionStateById({
        client,
        path: { id: args.processInstanceId },
        body: { suspended: true },
      })
      return { success: true, processInstanceId: args.processInstanceId, suspended: true }
    },
  })

  register({
    name: "camunda7_activate_process_instance",
    description: "Activate (unsuspend) a suspended process instance.",
    annotations: { openWorldHint: true },
    inputSchema: activateProcessInstanceInput.shape,
    handler: async (client, args) => {
      await updateSuspensionStateById({
        client,
        path: { id: args.processInstanceId },
        body: { suspended: false },
      })
      return { success: true, processInstanceId: args.processInstanceId, suspended: false }
    },
  })
}
