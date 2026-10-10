import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildJobPanelData } from "../data/cockpit-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, stepEngine } from "./shared.js"

/**
 * Jobs with the GLOBAL `/job/count` totals (all and failed) — adapter over
 * {@link buildJobPanelData}, the builder of `camunda7_show_job_panel`.
 * Consumed by `camunda7:job-panel`.
 */
export const loadJobsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-jobs",
  description:
    "The engine's jobs (first page) with exact totals of all and of failed jobs (no retries left). Powers camunda7:job-panel.",
  dataType: "camunda7:jobPanel",
  requires: [],
  optionalKeys: [ENGINE_KEY],
  produces: ["camunda7:jobPanelData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = await stepEngine(context, appConfig)
    // The show tool's defaults: every job, the first page.
    const data = await buildJobPanelData(client, engineId, { failedOnly: false })
    return {
      data,
      keys: { "camunda7:jobPanelData": data },
      _app: "camunda7",
      _step: "load-jobs",
    }
  },
}
