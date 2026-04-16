import { z } from "zod"
import type { Client } from "@miragon-ai/client-camunda7"
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
    inputSchema: {
      workerId: z.string().describe("The ID of the worker to lock tasks for"),
      maxTasks: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe("Maximum number of tasks to fetch"),
      topics: z
        .array(
          z.object({
            topicName: z.string().describe("Topic name to subscribe to"),
            lockDuration: z
              .number()
              .int()
              .positive()
              .default(300000)
              .describe("Lock duration in milliseconds"),
            variables: z
              .array(z.string())
              .optional()
              .describe("Variable names to include in the response"),
          }),
        )
        .describe("Topics to subscribe to"),
    },
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
    inputSchema: {
      externalTaskId: z.string().describe("The ID of the external task to complete"),
      workerId: z.string().describe("The ID of the worker that locked the task"),
      variables: z
        .record(
          z.string(),
          z.object({
            value: z.unknown(),
            type: z.string().optional(),
          }),
        )
        .optional()
        .describe("Variables to set when completing the task"),
    },
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
    inputSchema: {
      externalTaskId: z.string().describe("The ID of the external task"),
      workerId: z.string().describe("The ID of the worker that locked the task"),
      errorMessage: z.string().optional().describe("Error message describing the failure"),
      errorDetails: z.string().optional().describe("Detailed error information (e.g. stack trace)"),
      retries: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Remaining retries (0 creates an incident)"),
      retryTimeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Timeout in ms before the task can be retried"),
    },
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
