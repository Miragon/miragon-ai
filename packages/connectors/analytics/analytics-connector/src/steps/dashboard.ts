import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { PERIODS, queries, type Period } from "@miragon-ai/analytics-client"
import { analyticsSettingsSchema } from "../settings.js"
import { ENGINE_KEY_DECLARATION, stepEngines, type AnalyticsAppConfig } from "./app-config.js"

/**
 * The module default period. A pipeline step runs without the caller's
 * identity (the toolkit hands it only the pipeline keys), so the caller's
 * SAVED period cannot apply here — the schema default the settings fall back
 * to does, stated in the key's description.
 */
const MODULE_DEFAULT_PERIOD: Period = analyticsSettingsSchema.shape.defaultPeriod.parse(undefined)

/**
 * Loads the dashboard figures from Prometheus — window flows plus the live
 * state, the same `dashboardData` as `analytics_show_dashboard`. Consumed by
 * `analytics:dashboard`. Reads optional filter keys:
 * - `analytics:processDefinitionKey`
 * - `analytics:period` (1d | 3d | 7d | 14d | 30d)
 * - `analytics:engine` (configured engine id(s); omitted = all of them)
 */
export const loadDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-dashboard",
  description:
    "Process metrics: what happened within a time window (instances started/completed, incidents created/resolved, durations of the instances that ended) plus the live state right now (instances running, incidents open), per process definition and per (process, activity). Powers the four dashboard widgets (execution-summary-kpi, execution-performance-kpi, process-definition-breakdown, activity-bottleneck-table).",
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
      description: `Time window. Defaults to '${MODULE_DEFAULT_PERIOD}' (the module default — a step carries no caller, so a saved per-user default does not apply).`,
      enum: [...PERIODS],
    },
    ENGINE_KEY_DECLARATION,
  ],
  produces: ["analytics:dashboardData"],
  execute: async (context, appConfig) => {
    const processDefinitionKey = context.keys["analytics:processDefinitionKey"] as
      string | undefined
    const periodRaw = context.keys["analytics:period"]
    const period: Period = PERIODS.includes(periodRaw as Period)
      ? (periodRaw as Period)
      : MODULE_DEFAULT_PERIOD

    const data = await queries.dashboardData(appConfig.client, {
      processDefinitionKey,
      period,
      engine: stepEngines(context.keys, appConfig.engineScope),
    })

    return {
      data,
      keys: { "analytics:dashboardData": data },
      _app: "analytics",
      _step: "load-dashboard",
    }
  },
}
