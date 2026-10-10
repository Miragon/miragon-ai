import type { Period } from "./prometheus.js"

/**
 * One group of currently-open incidents — exactly what the
 * `camunda_incidents_open` gauge carries (no message, activity, timestamps or
 * instance ids exist on it).
 */
export interface ErrorPatternItem {
  incidentType: string
  processDefinitionKey: string
  incidentCount: number
}

/** One process definition's live failure state (point-in-time gauges). */
export interface ProcessFailureItem {
  processDefinitionKey: string
  /** Instances running right now. */
  runningNow: number
  /** Jobs whose retries are exhausted, right now. */
  deadJobs: number
  /** Incidents open right now. */
  openIncidents: number
  /**
   * `openIncidents` per 100 running instances — null when none run. One
   * instance can carry several incidents, so it may exceed 100.
   */
  incidentRatePct: number | null
}

export interface FailureDashboardData {
  /**
   * The engine ids the snapshot covers; `null` = every engine Prometheus
   * holds (an unscoped library call — the analytics tools always scope).
   */
  engines: string[] | null
  totalIncidents: number
  uniqueErrorPatterns: number
  mostAffectedProcess: string | null
  errorPatterns: ErrorPatternItem[]
  processBreakdown: ProcessFailureItem[]
}

/**
 * One BPMN element of one process definition — ids are only unique within a
 * model. Element names are not a metric label; resolve them from the BPMN.
 */
export interface ActivityBreakdownItem {
  processDefinitionKey: string
  activityId: string
  activityType: string
  executionCount: number
  avgDurationMs: number | null
  p95DurationMs: number | null
  totalTimeMs: number
}

export interface DefinitionBreakdownItem {
  processDefinitionKey: string
  /** Instances started in the window. */
  totalInstances: number
  /** Instances completed in the window. */
  completed: number
  /** Instances running right now (live gauge); null when no engine in scope reports its state gauges. */
  runningNow: number | null
  /** Incidents created in the window — incidents, not failed instances. */
  incidentsCreated: number
  avgDurationMs: number | null
}

export interface AnalyticsDashboardData {
  /** The scope the figures cover — echoed so no reader has to guess it. */
  processDefinitionKey: string | null
  period: Period
  /** The engine ids aggregated; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  // ── Flows within the window ───────────────────────────────────────────────
  /** Instances started in the window. */
  totalCount: number
  /** Instances completed in the window. */
  completedCount: number
  /** Incidents created in the window — incidents, not failed instances. */
  incidentsCreated: number
  /** Incidents resolved in the window (whenever they were created). */
  incidentsResolved: number
  /** `incidentsCreated` per 100 started instances (may exceed 100); null when nothing started. */
  incidentRatePct: number | null
  /** Durations of the instances that ENDED in the window; null when none did. */
  avgDurationMs: number | null
  medianDurationMs: number | null
  p95DurationMs: number | null
  // ── Live state, right now ────────────────────────────────────────────────
  /**
   * Instances running now (live gauge, independent of the window); 0 when an
   * engine in scope reports but runs none, null only when none reports.
   */
  runningNow: number | null
  /**
   * Incidents open now (live gauge — the failure dashboard's number); 0 when
   * an engine in scope reports but has none open, null only when none reports.
   */
  openIncidentsNow: number | null
  activityBreakdown: ActivityBreakdownItem[]
  definitionBreakdown: DefinitionBreakdownItem[]
}
