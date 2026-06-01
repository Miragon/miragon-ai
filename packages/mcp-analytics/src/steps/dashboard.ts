import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { queries, type Period, type PrometheusClient } from "@miragon-ai/client-analytics"

interface AnalyticsAppConfig {
  client: PrometheusClient
}

/**
 * Loads aggregated dashboard KPIs + activity bottleneck breakdown from
 * Prometheus. Consumed by `analytics:dashboard`. Reads optional filter keys:
 * - `analytics:processDefinitionKey`
 * - `analytics:period` (1d | 7d | 30d | 90d)
 */
export const loadDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-dashboard",
  description:
    "Aggregated execution KPIs (totals, durations, incident count) + activity bottleneck breakdown over a time window. Powers the four dashboard widgets (execution-summary-kpi, execution-performance-kpi, process-definition-breakdown, activity-bottleneck-table).",
  dataType: "analytics:dashboard",
  requires: [],
  optionalKeys: [
    {
      key: "analytics:processDefinitionKey",
      description:
        "Scope the dashboard to a single process definition (e.g. 'miraveloLeasing'). When omitted, all processes are aggregated.",
    },
    {
      key: "analytics:period",
      description: "Time window. Defaults to '7d'.",
      enum: ["1d", "7d", "30d", "90d"],
    },
  ],
  produces: ["analytics:dashboardData"],
  execute: async (context, appConfig) => {
    const ch = appConfig.client
    const processDefinitionKey = context.keys["analytics:processDefinitionKey"] as
      | string
      | undefined
    const periodRaw = (context.keys["analytics:period"] as string | undefined) ?? "7d"
    const period: Period = (["1d", "7d", "30d", "90d"] as const).includes(periodRaw as Period)
      ? (periodRaw as Period)
      : "7d"

    const data = await queries.dashboardData(ch, { processDefinitionKey, period })

    return {
      data,
      keys: { "analytics:dashboardData": data },
      _app: "analytics",
      _step: "load-dashboard",
    }
  },
}
