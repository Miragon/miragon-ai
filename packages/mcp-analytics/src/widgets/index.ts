import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import type { AnalyticsDashboardData, FailureDashboardData } from "@miragon-ai/client-analytics"
import { ExecutionSummaryKpi } from "./analytics-dashboard/execution-summary-kpi.js"
import { ExecutionPerformanceKpi } from "./analytics-dashboard/execution-performance-kpi.js"
import { ProcessDefinitionBreakdown } from "./analytics-dashboard/definition-breakdown.js"
import { ActivityBottleneckTable } from "./analytics-dashboard/activity-bottleneck-table.js"
import { PeriodSelector } from "./failure-dashboard/period-selector.js"
import { FailureSummaryKpi } from "./failure-dashboard/summary-kpi.js"
import { ErrorPatternsTable } from "./failure-dashboard/error-patterns-table.js"
import { FailureRateTable } from "./failure-dashboard/failure-rate-table.js"
import { ClusterCompareWidget, type ClusterCompareData } from "./cluster-compare.js"
import { VersionCompareWidget, type VersionCompareData } from "./version-compare.js"

export type { AnalyticsDashboardData, FailureDashboardData, ClusterCompareData, VersionCompareData }

export const ANALYTICS_DATA_TYPES = {
  dashboard: "analytics:dashboard",
  failureDashboard: "analytics:failureDashboard",
  clusterCompare: "analytics:clusterCompare",
  versionCompare: "analytics:versionCompare",
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
  "analytics:cluster-compare": adaptDataWidget(
    ClusterCompareWidget,
    ANALYTICS_DATA_TYPES.clusterCompare,
  ),
  "analytics:version-compare": adaptDataWidget(
    VersionCompareWidget,
    ANALYTICS_DATA_TYPES.versionCompare,
  ),
}
