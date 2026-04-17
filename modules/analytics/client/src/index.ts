export {
  createClickHouseClient,
  escapeString,
  type ClickHouseConfig,
  type ClickHouseClient,
} from "./clickhouse.js"
export * as schemas from "./schemas/index.js"
export * as queries from "./queries/index.js"
export * as widgets from "./widgets.js"

export type {
  ActivityHistoryItem,
  VariableChangeItem,
  OtelSpanItem,
  TraceResult,
  ProcessInstanceSearchRow,
  VariableSearchRow,
  ErrorPatternRow,
  FailedInstanceRow,
  PerformanceKPI,
  ActivityBreakdownRow,
  PeriodComparisonKpi,
  PeriodActivityComparisonRow,
  PeriodComparisonResult,
} from "./queries/index.js"

export type {
  ExecutionTraceData,
  VariableSearchData,
  ErrorPatternItem,
  ProcessFailureItem,
  FailureDashboardData,
  ActivityBreakdownItem,
  DefinitionBreakdownItem,
  AnalyticsDashboardData,
  AnalystCockpitData,
  AnalystCockpitKPIs,
  AnalystCockpitErrorPattern,
  AnalystCockpitBottleneck,
} from "./widgets.js"
