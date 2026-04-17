import type { ActivityHistoryItem, VariableChangeItem, OtelSpanItem } from "./queries/trace.js"
import type { VariableSearchRow } from "./queries/search.js"

export interface ExecutionTraceData {
  processInstanceId: string | null
  trace: {
    activityHistory?: ActivityHistoryItem[]
    variableChanges?: VariableChangeItem[]
    otelSpans?: OtelSpanItem[]
    otelSpansError?: string
  } | null
}

export interface VariableSearchData {
  results: VariableSearchRow[] | null
  searchParams: {
    variableName: string
    variableValue: string
    processDefinitionKey?: string
  } | null
}

export interface ErrorPatternItem {
  incidentMessage: string
  activityId: string
  processDefinitionKey: string
  incidentCount: number
  firstOccurrence: string
  lastOccurrence: string
  sampleInstanceIds: string[]
}

export interface ProcessFailureItem {
  processDefinitionKey: string
  totalInstances: number
  failedCount: number
  incidentCount: number
  failureRatePct: number
}

export interface FailureDashboardData {
  totalIncidents: number
  uniqueErrorPatterns: number
  mostAffectedProcess: string | null
  period: string
  errorPatterns: ErrorPatternItem[]
  processBreakdown: ProcessFailureItem[]
}

export interface ActivityBreakdownItem {
  activityId: string
  activityName: string
  activityType: string
  executionCount: number
  avgDurationMs: number
  p95DurationMs: number
  totalTimeMs: number
}

export interface DefinitionBreakdownItem {
  processDefinitionKey: string
  totalInstances: number
  completed: number
  running: number
  failed: number
  avgDurationMs: number | null
}

export interface AnalyticsDashboardData {
  totalCount: number
  completedCount: number
  runningCount: number
  failedCount: number
  incidentCount: number
  failureRatePct: number
  avgDurationMs: number | null
  medianDurationMs: number | null
  p95DurationMs: number | null
  activityBreakdown: ActivityBreakdownItem[]
  definitionBreakdown: DefinitionBreakdownItem[]
}

export interface AnalystCockpitKPIs {
  totalInstances: number
  failedInstances: number
  failureRatePct: number
  medianDurationMs: number | null
  p95DurationMs: number | null
}

export interface AnalystCockpitErrorPattern {
  incidentMessage: string
  activityId: string
  processDefinitionKey: string
  incidentCount: number
  sampleInstanceIds: string[]
}

export interface AnalystCockpitBottleneck {
  activityId: string
  activityName: string
  activityType: string
  executionCount: number
  p95DurationMs: number
  totalTimeMs: number
}

export interface AnalystCockpitData {
  processDefinitionKey: string | null
  period: "1d" | "7d" | "30d" | "90d"
  kpis: AnalystCockpitKPIs
  errorPatterns: AnalystCockpitErrorPattern[]
  bottlenecks: AnalystCockpitBottleneck[]
}
