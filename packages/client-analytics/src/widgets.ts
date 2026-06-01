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
