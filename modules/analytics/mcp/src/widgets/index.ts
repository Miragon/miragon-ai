import type { ComponentType } from "react"
import { AnalyticsDashboardWidget, type AnalyticsDashboardData } from "./analytics-dashboard.js"
import { FailureDashboardWidget, type FailureDashboardData } from "./failure-dashboard.js"
import { VariableSearchWidget, type VariableSearchData } from "./variable-search.js"
import { ExecutionTraceWidget, type ExecutionTraceData } from "./execution-trace.js"
import { PathFrequencyWidget, type PathFrequencyData } from "./path-frequency.js"
import { ClusterCompareWidget, type ClusterCompareData } from "./cluster-compare.js"

export type {
  AnalyticsDashboardData,
  FailureDashboardData,
  VariableSearchData,
  ExecutionTraceData,
  PathFrequencyData,
  ClusterCompareData,
}

export const analyticsWidgets: Record<string, ComponentType<{ data: unknown }>> = {
  "analytics:dashboard": AnalyticsDashboardWidget as ComponentType<{ data: unknown }>,
  "analytics:failure-dashboard": FailureDashboardWidget as ComponentType<{ data: unknown }>,
  "analytics:variable-search": VariableSearchWidget as ComponentType<{ data: unknown }>,
  "analytics:execution-trace": ExecutionTraceWidget as ComponentType<{ data: unknown }>,
  "analytics:path-frequency": PathFrequencyWidget as ComponentType<{ data: unknown }>,
  "analytics:cluster-compare": ClusterCompareWidget as ComponentType<{ data: unknown }>,
}
