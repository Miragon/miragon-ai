import { z } from "zod"

export const fetchAndLockInput = z.object({
  workerId: z.string().describe("The ID of the worker to lock tasks for"),
  maxTasks: z.number().int().positive().default(10).describe("Maximum number of tasks to fetch"),
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
})

export const completeExternalTaskInput = z.object({
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
})

export const handleExternalTaskFailureInput = z.object({
  externalTaskId: z.string().describe("The ID of the external task"),
  workerId: z.string().describe("The ID of the worker that locked the task"),
  errorMessage: z.string().optional().describe("Error message describing the failure"),
  errorDetails: z.string().optional().describe("Detailed error information (e.g. stack trace)"),
  retries: z.number().int().min(0).optional().describe("Remaining retries (0 creates an incident)"),
  retryTimeout: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Timeout in ms before the task can be retried"),
})
