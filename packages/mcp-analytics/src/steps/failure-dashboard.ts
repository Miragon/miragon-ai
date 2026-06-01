import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { queries, type Period, type PrometheusClient } from "@miragon-ai/client-analytics"

interface AnalyticsAppConfig {
  client: PrometheusClient
}

/**
 * Loads aggregated failure / incident analysis from Prometheus for the
 * `analytics:failure-dashboard` widget. Reads optional filter keys:
 * - `analytics:period` (1d | 7d | 30d | 90d)
 */
export const loadFailureDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-failure-dashboard",
  description:
    "Aggregated failure / incident analysis grouped by incident type and process definition. Powers the failure widgets (failure-summary-kpi, failure-rate-table, error-patterns-table, period-selector).",
  dataType: "analytics:failureDashboard",
  requires: [],
  optionalKeys: [
    {
      key: "analytics:period",
      description: "Time window. Defaults to '7d'.",
      enum: ["1d", "7d", "30d", "90d"],
    },
  ],
  produces: ["analytics:failureDashboardData"],
  execute: async (context, appConfig) => {
    const ch = appConfig.client
    const periodRaw = (context.keys["analytics:period"] as string | undefined) ?? "7d"
    const period: Period = (["1d", "7d", "30d", "90d"] as const).includes(periodRaw as Period)
      ? (periodRaw as Period)
      : "7d"

    const data = await queries.failureDashboardData(ch, { period })

    return {
      data,
      keys: { "analytics:failureDashboardData": data },
      _app: "analytics",
      _step: "load-failure-dashboard",
    }
  },
}
