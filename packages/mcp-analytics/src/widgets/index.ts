import { adaptDataWidget } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import type { AnalyticsDashboardData, FailureDashboardData } from "@miragon-ai/client-analytics"
import { ExecutionSummaryKpi } from "./analytics-dashboard/execution-summary-kpi.js"
import { ExecutionPerformanceKpi } from "./analytics-dashboard/execution-performance-kpi.js"
import { ProcessDefinitionBreakdown } from "./analytics-dashboard/definition-breakdown.js"
import { ActivityBottleneckTable } from "./analytics-dashboard/activity-bottleneck-table.js"
import { FailureSummaryKpi } from "./failure-dashboard/summary-kpi.js"
import { ErrorPatternsTable } from "./failure-dashboard/error-patterns-table.js"
import { FailureRateTable } from "./failure-dashboard/failure-rate-table.js"
import { ClusterCompareWidget, type ClusterCompareData } from "./cluster-compare.js"
import { VersionCompareWidget, type VersionCompareData } from "./version-compare.js"
import { EngineCompareWidget, type EngineCompareData } from "./engine-compare.js"
import { BpmnHeatmapWidget, type BpmnHeatmapData } from "@miragon-ai/widget-shell/widgets"
import {
  describeActivityBottlenecks,
  describeBpmnHeatmap,
  describeClusterCompare,
  describeDefinitionBreakdown,
  describeEngineCompare,
  describeErrorPatterns,
  describeExecutionPerformance,
  describeExecutionSummary,
  describeFailureRates,
  describeFailureSummary,
  describeVersionCompare,
} from "./model-descriptions.js"

export type {
  AnalyticsDashboardData,
  FailureDashboardData,
  ClusterCompareData,
  VersionCompareData,
  EngineCompareData,
  BpmnHeatmapData,
}

export const ANALYTICS_DATA_TYPES = {
  dashboard: "analytics:dashboard",
  failureDashboard: "analytics:failureDashboard",
  clusterCompare: "analytics:clusterCompare",
  versionCompare: "analytics:versionCompare",
  engineCompare: "analytics:engineCompare",
  bpmnHeatmap: "analytics:bpmnHeatmap",
} as const

// Every widget passes a `describeForModel` so the model always knows the view,
// its active filters (period / engine scope) and the headline numbers — see
// `model-descriptions.ts` for the house pattern.
export const analyticsWidgets: Record<string, WidgetComponent> = {
  "analytics:execution-summary-kpi": adaptDataWidget(
    ExecutionSummaryKpi,
    ANALYTICS_DATA_TYPES.dashboard,
    describeExecutionSummary,
  ),
  "analytics:execution-performance-kpi": adaptDataWidget(
    ExecutionPerformanceKpi,
    ANALYTICS_DATA_TYPES.dashboard,
    describeExecutionPerformance,
  ),
  "analytics:process-definition-breakdown": adaptDataWidget(
    ProcessDefinitionBreakdown,
    ANALYTICS_DATA_TYPES.dashboard,
    describeDefinitionBreakdown,
  ),
  "analytics:activity-bottleneck-table": adaptDataWidget(
    ActivityBottleneckTable,
    ANALYTICS_DATA_TYPES.dashboard,
    describeActivityBottlenecks,
  ),
  "analytics:failure-summary-kpi": adaptDataWidget(
    FailureSummaryKpi,
    ANALYTICS_DATA_TYPES.failureDashboard,
    describeFailureSummary,
  ),
  "analytics:error-patterns-table": adaptDataWidget(
    ErrorPatternsTable,
    ANALYTICS_DATA_TYPES.failureDashboard,
    describeErrorPatterns,
  ),
  "analytics:failure-rate-table": adaptDataWidget(
    FailureRateTable,
    ANALYTICS_DATA_TYPES.failureDashboard,
    describeFailureRates,
  ),
  "analytics:cluster-compare": adaptDataWidget(
    ClusterCompareWidget,
    ANALYTICS_DATA_TYPES.clusterCompare,
    describeClusterCompare,
  ),
  "analytics:version-compare": adaptDataWidget(
    VersionCompareWidget,
    ANALYTICS_DATA_TYPES.versionCompare,
    describeVersionCompare,
  ),
  "analytics:engine-compare": adaptDataWidget(
    EngineCompareWidget,
    ANALYTICS_DATA_TYPES.engineCompare,
    describeEngineCompare,
  ),
  "analytics:bpmn-heatmap": adaptDataWidget(
    BpmnHeatmapWidget,
    ANALYTICS_DATA_TYPES.bpmnHeatmap,
    describeBpmnHeatmap,
  ),
}
