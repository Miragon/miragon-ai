import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { queries } from "@miragon-ai/analytics-client"
import { ENGINE_KEY_DECLARATION, stepEngines, type AnalyticsAppConfig } from "./app-config.js"

/**
 * Loads current failure / incident state from Prometheus for the
 * failure-dashboard widgets. Point-in-time (live state gauges), so there is no
 * time-window input. Reads the optional `analytics:engine` key (configured
 * engine id(s); omitted = all of them).
 */
export const loadFailureDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-failure-dashboard",
  description:
    "The incidents open right now, grouped by incident type and process definition, plus each affected process's running instances and dead jobs. Powers the failure widgets (failure-summary-kpi, failure-rate-table, error-patterns-table).",
  dataType: "analytics:failureDashboard",
  requires: [],
  optionalKeys: [ENGINE_KEY_DECLARATION],
  produces: ["analytics:failureDashboardData"],
  execute: async (context, appConfig) => {
    const data = await queries.failureDashboardData(appConfig.client, {
      engine: stepEngines(context.keys, appConfig.engineScope),
    })

    return {
      data,
      keys: { "analytics:failureDashboardData": data },
      _app: "analytics",
      _step: "load-failure-dashboard",
    }
  },
}
