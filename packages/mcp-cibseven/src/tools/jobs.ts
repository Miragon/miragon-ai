import {
  listJobsInput,
  setJobRetriesInput,
  setJobRetriesBatchInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getJobs,
  setJobRetries,
  setJobRetriesAsyncOperation,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerJobTools(register: Register) {
  register({
    name: "camunda7_list_jobs",
    description: "List jobs (timers, async continuations) with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listJobsInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
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
    ),
  })

  register({
    name: "camunda7_set_job_retries",
    description:
      "Set the number of retries for a failed job. Setting retries > 0 will re-execute the job.",
    annotations: { openWorldHint: true },
    inputSchema: { ...setJobRetriesInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await setJobRetries({
        client,
        path: { id: args.jobId },
        body: { retries: args.retries },
      })
      return { success: true, jobId: args.jobId, retries: args.retries }
    }),
  })

  register({
    name: "camunda7_set_job_retries_batch",
    description:
      "Create a batch job to set retries on multiple jobs at once. Returns the batch id; progress and failures are tracked on the batch, not inline.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...setJobRetriesBatchInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      const batch = await setJobRetriesAsyncOperation({
        client,
        body: {
          jobIds: args.jobIds,
          retries: args.retries,
          dueDate: args.dueDate,
        },
      })
      return {
        success: true,
        jobCount: args.jobIds.length,
        retries: args.retries,
        batch,
      }
    }),
  })
}
