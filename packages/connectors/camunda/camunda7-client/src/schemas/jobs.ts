import { z } from "zod"
import {
  engineDateParam,
  firstResultParam,
  flagParam,
  maxResultsParam,
  sortOrderParam,
} from "./shared.js"

export const listJobsInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  activityId: z.string().optional().describe("Filter by the activity the job belongs to"),
  withRetriesLeft: flagParam("true = only jobs with retries > 0, false = only failed (0 retries)"),
  noRetriesLeft: flagParam("true = only failed jobs (0 retries), false = only retries > 0"),
  active: flagParam("true = only active jobs, false = only suspended"),
  suspended: flagParam("true = only suspended jobs, false = only active"),
  firstResult: firstResultParam,
  maxResults: maxResultsParam(),
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
  sortOrder: sortOrderParam,
})

export const setJobRetriesInput = z.object({
  jobId: z.string().describe("The job ID"),
  retries: z.number().int().min(0).describe("Number of retries to set"),
})

export const setJobRetriesBatchInput = z.object({
  jobIds: z.array(z.string()).min(1).describe("IDs of the jobs whose retries should be set."),
  retries: z.number().int().min(0).describe("Number of retries to set on every job. Must be >= 0."),
  dueDate: engineDateParam("New due date; a past one runs the jobs at once"),
})

/**
 * A job's exception stacktrace (`GET /job/{id}/stacktrace`, read via the
 * engine contract's `fetchJobStacktrace`) — the failure detail
 * `camunda7_list_jobs` only summarises as `exceptionMessage`.
 */
export const getJobStacktraceInput = z.object({
  jobId: z.string().min(1).describe("The job ID (e.g. from camunda7_list_jobs)"),
})
