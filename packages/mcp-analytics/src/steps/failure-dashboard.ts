import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { queries, type PrometheusClient } from "@miragon-ai/client-analytics"

interface AnalyticsAppConfig {
  client: PrometheusClient
}

/**
 * Loads current failure / incident state from Prometheus for the
 * `analytics:failure-dashboard` widget. Point-in-time (live state gauges), so
 * there is no time-window input.
 */
export const loadFailureDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-failure-dashboard",
  description:
    "Current failure / incident state grouped by incident type and process definition. Powers the failure widgets (failure-summary-kpi, failure-rate-table, error-patterns-table).",
  dataType: "analytics:failureDashboard",
  requires: [],
  optionalKeys: [],
  produces: ["analytics:failureDashboardData"],
  execute: async (_context, appConfig) => {
    const ch = appConfig.client

    const data = await queries.failureDashboardData(ch, {})

    return {
      data,
      keys: { "analytics:failureDashboardData": data },
      _app: "analytics",
      _step: "load-failure-dashboard",
    }
  },
}
