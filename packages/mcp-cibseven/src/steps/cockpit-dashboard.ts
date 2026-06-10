import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildCockpitDashboardData } from "../data/cockpit-data.js"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads aggregated statistics for all deployed process definitions. Thin
 * adapter over {@link buildCockpitDashboardData} — the same builder the
 * `camunda7_show_cockpit_dashboard` widget tool and the cockpit data feed use.
 * Consumed by `camunda7:cockpit-dashboard`.
 */
export const loadCockpitDashboardStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-cockpit-dashboard",
  dataType: "camunda7:cockpitDashboard",
  requires: [],
  produces: ["camunda7:cockpitDashboardData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )

    const data = await buildCockpitDashboardData(client, engineId)

    return {
      data,
      keys: { "camunda7:cockpitDashboardData": data },
      _app: "camunda7",
      _step: "load-cockpit-dashboard",
    }
  },
}
