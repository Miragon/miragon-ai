import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
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

export const ANALYTICS_DATA_TYPES = {
  dashboard: "analytics:dashboard",
  failureDashboard: "analytics:failureDashboard",
  variableSearch: "analytics:variableSearch",
  executionTrace: "analytics:executionTrace",
  pathFrequency: "analytics:pathFrequency",
  clusterCompare: "analytics:clusterCompare",
} as const

export const analyticsWidgets: Record<string, WidgetComponent> = {
  "analytics:dashboard": adaptDataWidget(AnalyticsDashboardWidget, ANALYTICS_DATA_TYPES.dashboard),
  "analytics:failure-dashboard": adaptDataWidget(
    FailureDashboardWidget,
    ANALYTICS_DATA_TYPES.failureDashboard,
  ),
  "analytics:variable-search": adaptDataWidget(
    VariableSearchWidget,
    ANALYTICS_DATA_TYPES.variableSearch,
  ),
  "analytics:execution-trace": adaptDataWidget(
    ExecutionTraceWidget,
    ANALYTICS_DATA_TYPES.executionTrace,
  ),
  "analytics:path-frequency": adaptDataWidget(
    PathFrequencyWidget,
    ANALYTICS_DATA_TYPES.pathFrequency,
  ),
  "analytics:cluster-compare": adaptDataWidget(
    ClusterCompareWidget,
    ANALYTICS_DATA_TYPES.clusterCompare,
  ),
}
