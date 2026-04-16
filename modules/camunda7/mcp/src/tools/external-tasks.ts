import type { Client } from "@miragon-ai/client-camunda7"
import {
  fetchAndLockInput,
  completeExternalTaskInput,
  handleExternalTaskFailureInput,
} from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  fetchAndLock,
  completeExternalTaskResource,
  handleFailure,
} from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerExternalTaskTools(register: Register) {
  register({
    name: "camunda7_fetch_and_lock",
    description:
      "Fetch and lock external tasks for a given worker. Returns tasks that match the specified topic(s) and locks them for processing.",
    annotations: { openWorldHint: true },
    inputSchema: fetchAndLockInput.shape,
    handler: async (client, args) =>
      fetchAndLock({
        client,
        body: {
          workerId: args.workerId,
          maxTasks: args.maxTasks,
          topics: args.topics,
        },
      }),
  })

  register({
    name: "camunda7_complete_external_task",
    description:
      "Complete an external task that was previously fetched and locked. Optionally set variables.",
    annotations: { openWorldHint: true },
    inputSchema: completeExternalTaskInput.shape,
    handler: async (client, args) => {
      await completeExternalTaskResource({
        client,
        path: { id: args.externalTaskId },
        body: {
          workerId: args.workerId,
          variables: args.variables as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
        },
      })
      return { success: true, externalTaskId: args.externalTaskId }
    },
  })

  register({
    name: "camunda7_handle_external_task_failure",
    description:
      "Report a failure for an external task. Sets the error message, remaining retries, and retry timeout.",
    annotations: { openWorldHint: true },
    inputSchema: handleExternalTaskFailureInput.shape,
    handler: async (client, args) => {
      await handleFailure({
        client,
        path: { id: args.externalTaskId },
        body: {
          workerId: args.workerId,
          errorMessage: args.errorMessage,
          errorDetails: args.errorDetails,
          retries: args.retries,
          retryTimeout: args.retryTimeout,
        },
      })
      return { success: true, externalTaskId: args.externalTaskId }
    },
  })
}
