import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildJobPanelData } from "../data/cockpit-data.js"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads jobs with a focus on failed jobs (no retries left). Thin adapter over
 * {@link buildJobPanelData}, so the `render-view` path shows the same global
 * `/job/count` totals as the `camunda7_show_job_panel` widget tool (instead of
 * counts capped to a fetched page). Consumed by `camunda7:job-panel`.
 */
export const loadJobsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-jobs",
  dataType: "camunda7:jobPanel",
  requires: [],
  produces: ["camunda7:jobPanelData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )

    const data = await buildJobPanelData(client, engineId, {})

    return {
      data,
      keys: { "camunda7:jobPanelData": data },
      _app: "camunda7",
      _step: "load-jobs",
    }
  },
}
