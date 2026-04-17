import type { ComponentType } from "react"
import { AnalyticsDashboardWidget, type AnalyticsDashboardData } from "./analytics-dashboard.js"
import { FailureDashboardWidget, type FailureDashboardData } from "./failure-dashboard.js"
import { VariableSearchWidget, type VariableSearchData } from "./variable-search.js"
import { ExecutionTraceWidget, type ExecutionTraceData } from "./execution-trace.js"
import { AnalystCockpitWidget, type AnalystCockpitData } from "./analyst-cockpit.js"

export type {
  AnalyticsDashboardData,
  FailureDashboardData,
  VariableSearchData,
  ExecutionTraceData,
  AnalystCockpitData,
}

export const analyticsWidgets: Record<string, ComponentType<{ data: unknown }>> = {
  "analytics:dashboard": AnalyticsDashboardWidget as ComponentType<{ data: unknown }>,
  "analytics:failure-dashboard": FailureDashboardWidget as ComponentType<{ data: unknown }>,
  "analytics:variable-search": VariableSearchWidget as ComponentType<{ data: unknown }>,
  "analytics:execution-trace": ExecutionTraceWidget as ComponentType<{ data: unknown }>,
  "analytics:analyst-cockpit": AnalystCockpitWidget as ComponentType<{ data: unknown }>,
}
