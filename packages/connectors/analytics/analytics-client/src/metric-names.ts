/**
 * Prometheus series names for the engine-plugin metrics, mirroring
 * `packages/connectors/analytics/analytics-client/metrics-contract.json` — the single source of
 * truth for the Kotlin↔TS metric contract. Change the contract first; the
 * contract test (`src/metrics-contract.test.ts`) diffs this object against the
 * JSON, so a drift fails `pnpm test`.
 *
 * Histogram entries are the base series name — append `_sum` / `_count` /
 * `_bucket` at the call site. Hand-maintained (not imported from the JSON)
 * because the contract file lives outside the tsconfig `rootDir`.
 */
export const METRIC_NAMES = {
  // Counters (history-event stream)
  processInstanceStarted: "camunda_process_instance_started_total",
  processInstanceEnded: "camunda_process_instance_ended_total",
  activityEnded: "camunda_activity_ended_total",
  userTaskCreated: "camunda_usertask_created_total",
  userTaskCompleted: "camunda_usertask_completed_total",
  incidentCreated: "camunda_incident_created_total",
  incidentResolved: "camunda_incident_resolved_total",
  // Histograms in whole milliseconds (base name; `_sum`/`_count`/`_bucket` series implied)
  processInstanceDuration: "camunda_process_instance_duration_milliseconds",
  activityDuration: "camunda_activity_duration_milliseconds",
  userTaskDuration: "camunda_usertask_duration_milliseconds",
  // Gauges (point-in-time engine state)
  processInstancesRunning: "camunda_process_instances_running",
  jobsFailed: "camunda_jobs_failed",
  incidentsOpen: "camunda_incidents_open",
  jobsExecutable: "camunda_jobs_executable",
  jobsSuspended: "camunda_jobs_suspended",
  jobsDueFuture: "camunda_jobs_due_future",
  userTasksOpen: "camunda_usertasks_open",
  processDefinitionsDeployed: "camunda_process_definitions_deployed",
  externalTasksOpen: "camunda_external_tasks_open",
} as const

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES]

/** The engine-state gauges: every one is an engine-wide figure, reported alike by every node. */
export type GaugeName =
  | typeof METRIC_NAMES.processInstancesRunning
  | typeof METRIC_NAMES.jobsFailed
  | typeof METRIC_NAMES.incidentsOpen
  | typeof METRIC_NAMES.jobsExecutable
  | typeof METRIC_NAMES.jobsSuspended
  | typeof METRIC_NAMES.jobsDueFuture
  | typeof METRIC_NAMES.userTasksOpen
  | typeof METRIC_NAMES.processDefinitionsDeployed
  | typeof METRIC_NAMES.externalTasksOpen

/**
 * The contract labels of each gauge: what makes one of its rows. A clustered
 * engine's nodes are folded over exactly these (`max by`, contract rule 3), so
 * node identity labels (`instance`, `job`) drop out and nothing else does. The
 * contract test diffs this map against the JSON.
 */
export const GAUGE_LABELS: Readonly<Record<GaugeName, readonly string[]>> = {
  [METRIC_NAMES.processInstancesRunning]: ["process_definition_key", "engine_id"],
  [METRIC_NAMES.jobsFailed]: ["process_definition_key", "engine_id"],
  [METRIC_NAMES.incidentsOpen]: ["process_definition_key", "incident_type", "engine_id"],
  [METRIC_NAMES.jobsExecutable]: ["engine_id"],
  [METRIC_NAMES.jobsSuspended]: ["engine_id"],
  [METRIC_NAMES.jobsDueFuture]: ["engine_id"],
  [METRIC_NAMES.userTasksOpen]: ["status", "engine_id"],
  [METRIC_NAMES.processDefinitionsDeployed]: ["process_definition_key", "engine_id"],
  [METRIC_NAMES.externalTasksOpen]: ["engine_id"],
}
