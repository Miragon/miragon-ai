import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { JobPanelData } from "@miragon-ai/client-cibseven"
import { getJobs } from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

interface JobRow {
  id: string
  processInstanceId: string
  processDefinitionKey?: string | null
  processDefinitionId?: string | null
  activityId?: string | null
  retries: number
  exceptionMessage?: string | null
  dueDate?: string | null
  suspended: boolean
  priority: number
  createTime?: string | null
}

/**
 * Loads jobs with a focus on failed jobs (no retries left).
 * Consumed by `camunda7:job-panel`.
 */
export const loadJobsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-jobs",
  dataType: "camunda7:jobPanel",
  requires: [],
  produces: ["camunda7:jobPanelData"],
  execute: async (context, appConfig) => {
    const { client } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )

    // Fetch failed jobs (no retries) and all jobs in parallel
    const [failedJobs, allJobs] = await Promise.all([
      getJobs({
        client,
        query: {
          noRetriesLeft: true,
          maxResults: 100,
          sortBy: "jobId",
          sortOrder: "desc",
        },
      }).catch(() => []),
      getJobs({
        client,
        query: {
          maxResults: 100,
          sortBy: "jobId",
          sortOrder: "desc",
        },
      }).catch(() => []),
    ])

    const failed = Array.isArray(failedJobs) ? (failedJobs as JobRow[]) : []
    const all = Array.isArray(allJobs) ? (allJobs as JobRow[]) : []

    const jobs = all.map((j) => ({
      id: j.id,
      processInstanceId: j.processInstanceId,
      processDefinitionKey: j.processDefinitionKey ?? null,
      processDefinitionId: j.processDefinitionId ?? null,
      activityId: j.activityId ?? null,
      retries: j.retries,
      exceptionMessage: j.exceptionMessage ?? null,
      dueDate: j.dueDate ?? null,
      suspended: j.suspended,
      priority: j.priority,
      createTime: j.createTime ?? null,
    }))

    const data: JobPanelData = {
      totalCount: all.length,
      failedCount: failed.length,
      jobs,
    }

    return {
      data,
      keys: { "camunda7:jobPanelData": data },
      _app: "camunda7",
      _step: "load-jobs",
    }
  },
}
