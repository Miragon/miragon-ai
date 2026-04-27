import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { ExecutionSummaryKpi } from "./analytics-dashboard/execution-summary-kpi.js"
import { ExecutionPerformanceKpi } from "./analytics-dashboard/execution-performance-kpi.js"
import { ProcessDefinitionBreakdown } from "./analytics-dashboard/definition-breakdown.js"
import { ActivityBottleneckTable } from "./analytics-dashboard/activity-bottleneck-table.js"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { PeriodSelector } from "./failure-dashboard/period-selector.js"
import { FailureSummaryKpi } from "./failure-dashboard/summary-kpi.js"
import { ErrorPatternsTable } from "./failure-dashboard/error-patterns-table.js"
import { FailureRateTable } from "./failure-dashboard/failure-rate-table.js"
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
  "analytics:execution-summary-kpi": adaptDataWidget(
    ExecutionSummaryKpi,
    ANALYTICS_DATA_TYPES.dashboard,
  ),
  "analytics:execution-performance-kpi": adaptDataWidget(
    ExecutionPerformanceKpi,
    ANALYTICS_DATA_TYPES.dashboard,
  ),
  "analytics:process-definition-breakdown": adaptDataWidget(
    ProcessDefinitionBreakdown,
    ANALYTICS_DATA_TYPES.dashboard,
  ),
  "analytics:activity-bottleneck-table": adaptDataWidget(
    ActivityBottleneckTable,
    ANALYTICS_DATA_TYPES.dashboard,
  ),
  "analytics:period-selector": adaptDataWidget(
    PeriodSelector,
    ANALYTICS_DATA_TYPES.failureDashboard,
  ),
  "analytics:failure-summary-kpi": adaptDataWidget(
    FailureSummaryKpi,
    ANALYTICS_DATA_TYPES.failureDashboard,
  ),
  "analytics:error-patterns-table": adaptDataWidget(
    ErrorPatternsTable,
    ANALYTICS_DATA_TYPES.failureDashboard,
  ),
  "analytics:failure-rate-table": adaptDataWidget(
    FailureRateTable,
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
