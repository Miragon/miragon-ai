/**
 * Prometheus series names for the engine-plugin metrics, mirroring
 * `packages/client-analytics/metrics-contract.json` — the single source of
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
  // Histograms (base name; `_sum`/`_count`/`_bucket` series implied)
  processInstanceDuration: "camunda_process_instance_duration_seconds",
  activityDuration: "camunda_activity_duration_seconds",
  userTaskDuration: "camunda_usertask_duration_seconds",
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
