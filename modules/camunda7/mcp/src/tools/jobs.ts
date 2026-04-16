import type { Client } from "@miragon-ai/client-camunda7"
import { listJobsInput, setJobRetriesInput } from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getJobs, setJobRetries } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerJobTools(register: Register) {
  register({
    name: "camunda7_list_jobs",
    description: "List jobs (timers, async continuations) with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listJobsInput.shape,
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
    inputSchema: setJobRetriesInput.shape,
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
