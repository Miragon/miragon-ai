import { z } from "zod"

export const listJobsInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  withRetriesLeft: z.boolean().optional().describe("Only jobs with retries > 0"),
  noRetriesLeft: z.boolean().optional().describe("Only jobs with retries = 0 (failed)"),
  active: z.boolean().optional().describe("Only active jobs"),
  suspended: z.boolean().optional().describe("Only suspended jobs"),
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
