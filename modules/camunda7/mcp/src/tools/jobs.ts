import { z } from "zod"
import type { Client } from "@miragon-ai/client-camunda7"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getJobs, setJobRetries } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerJobTools(register: Register) {
  register({
    name: "camunda7_list_jobs",
    description: "List jobs (timers, async continuations) with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
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
          "createTime",
        ])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getJobs({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          processDefinitionKey: args.processDefinitionKey,
          withRetriesLeft: args.withRetriesLeft,
          noRetriesLeft: args.noRetriesLeft,
          active: args.active,
          suspended: args.suspended,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_set_job_retries",
    description:
      "Set the number of retries for a failed job. Setting retries > 0 will re-execute the job.",
    annotations: { openWorldHint: true },
    inputSchema: {
      jobId: z.string().describe("The job ID"),
      retries: z.number().int().min(0).describe("Number of retries to set"),
    },
    handler: async (client, args) => {
      await setJobRetries({
        client,
        path: { id: args.jobId },
        body: { retries: args.retries },
      })
      return { success: true, jobId: args.jobId, retries: args.retries }
    },
  })
}
