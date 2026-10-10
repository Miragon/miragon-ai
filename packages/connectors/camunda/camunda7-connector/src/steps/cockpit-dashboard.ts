import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildCockpitDashboardData } from "../data/cockpit-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, stepEngine } from "./shared.js"

/**
 * The process landscape, one row per definition key — adapter over
 * {@link buildCockpitDashboardData}, the builder of the
 * `camunda7_cockpit_overview_data` feed. Consumed by
 * `camunda7:process-health-kpi` and `camunda7:process-definitions-table`.
 */
export const loadCockpitDashboardStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-cockpit-dashboard",
  description:
    "The process landscape: one row per definition key with running instances, failed jobs and incidents summed over all versions. Powers camunda7:process-health-kpi and camunda7:process-definitions-table.",
  dataType: "camunda7:cockpitDashboard",
  requires: [],
  optionalKeys: [ENGINE_KEY],
  produces: ["camunda7:cockpitDashboardData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = await stepEngine(context, appConfig)
    const data = await buildCockpitDashboardData(client, engineId)
    return {
      data,
      keys: { "camunda7:cockpitDashboardData": data },
      _app: "camunda7",
      _step: "load-cockpit-dashboard",
    }
  },
}
