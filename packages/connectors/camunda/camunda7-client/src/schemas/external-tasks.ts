import { z } from "zod"
import { firstResultParam } from "./shared.js"

/**
 * Read-only external-task query (`GET /external-task`) — inspects what the
 * workers see without locking, completing or failing anything. The boolean
 * filters are TRUE-ONLY on the engine side: `false` matches every task.
 */
export const listExternalTasksInput = z.object({
  topicName: z.string().optional().describe("Filter by external task topic"),
  workerId: z
    .string()
    .optional()
    .describe("Filter by the id of the worker that most recently locked the task"),
  locked: z
    .boolean()
    .optional()
    .describe("true = only tasks currently locked (lock not expired); false matches all"),
  notLocked: z
    .boolean()
    .optional()
    .describe("true = only tasks currently NOT locked (no lock, or it expired); false matches all"),
  withRetriesLeft: z
    .boolean()
    .optional()
    .describe("true = only tasks with retries > 0 (or not set yet); false matches all"),
  noRetriesLeft: z
    .boolean()
    .optional()
    .describe("true = only tasks with 0 retries (failed, an incident exists); false matches all"),
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  activityId: z.string().optional().describe("Filter by the activity the task was created for"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z
    .enum([
      "id",
      "lockExpirationTime",
      "processInstanceId",
      "processDefinitionId",
      "processDefinitionKey",
      "taskPriority",
      "tenantId",
    ])
    .optional()
    .describe("Sort field; sorts ascending unless sortOrder is given"),
  sortOrder: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction for sortBy (default asc); ignored without sortBy"),
})

/**
 * Per-task retries (`PUT /external-task/{id}/retries`) — the operations-level
 * recovery for a failed external task: retries > 0 hand it back to its
 * workers and clear its `failedExternalTask` incident (which
 * `camunda7_resolve_incident` cannot resolve); 0 raises one.
 */
export const setExternalTaskRetriesInput = z.object({
  externalTaskId: z.string().describe("The external task ID (from camunda7_list_external_tasks)"),
  retries: z
    .number()
    .int()
    .min(0)
    .describe("Number of retries to set; > 0 makes a failed task available to its workers again"),
})

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
