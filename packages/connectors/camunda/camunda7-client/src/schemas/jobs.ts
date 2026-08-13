import { z } from "zod"
import { firstResultParam } from "./shared.js"

export const listJobsInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  withRetriesLeft: z.boolean().optional().describe("Only jobs with retries > 0"),
  noRetriesLeft: z.boolean().optional().describe("Only jobs with retries = 0 (failed)"),
  active: z.boolean().optional().describe("Only active jobs"),
  suspended: z.boolean().optional().describe("Only suspended jobs"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z
    .enum([
      "jobId",
      "executionId",
      "processInstanceId",
      "processDefinitionId",
      "processDefinitionKey",
      "jobPriority",
      "jobRetries",
      "jobDueDate",
      "tenantId",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const setJobRetriesInput = z.object({
  jobId: z.string().describe("The job ID"),
  retries: z.number().int().min(0).describe("Number of retries to set"),
})

export const setJobRetriesBatchInput = z.object({
  jobIds: z.array(z.string()).min(1).describe("IDs of the jobs whose retries should be set."),
  retries: z.number().int().min(0).describe("Number of retries to set on every job. Must be >= 0."),
  dueDate: z
    .string()
    .optional()
    .describe("Optional ISO-8601 due date. Jobs with a past due date are scheduled immediately."),
})
