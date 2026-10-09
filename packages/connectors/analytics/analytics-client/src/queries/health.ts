import {
  engineMatcher,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

export interface HealthCount {
  label: string
  count: number
}

export interface HealthAlert {
  name: string
  severity: string
  scope: string
}

/**
 * How {@link engineHealth} decides `status`, in words — carried in every
 * result (`statusRule`) and the tool description, so no reader mistakes this
 * alert-based verdict for camunda7_show_engine_health's incident-count one:
 * the two judge different data by different rules and may disagree for the
 * same engine (500 open incidents without a firing critical alert stay
 * "degraded" here).
 */
export const ENGINE_HEALTH_STATUS_RULE =
  "From Prometheus: critical only while an alert rule with severity=critical fires; degraded with any firing alert, dead job or open incident; else healthy."

export interface EngineHealthResult {
  status: "healthy" | "degraded" | "critical"
  /** How `status` was decided ({@link ENGINE_HEALTH_STATUS_RULE}). */
  statusRule: string
  runningInstances: number
  runningByDefinition: HealthCount[]
  openIncidents: number
  openIncidentsByType: HealthCount[]
  deadJobs: number
  executableJobs: number
  suspendedJobs: number
  openUserTasks: number
  unassignedUserTasks: number
  openExternalTasks: number
  deployedDefinitionKeys: number
  firingAlerts: HealthAlert[]
  pendingAlerts: HealthAlert[]
}

const first = (s: PromSample[]) => (s.length ? Math.round(s[0].value) : 0)

function counts(samples: PromSample[], label: string): HealthCount[] {
  return samples
    .map((s) => ({ label: s.metric[label] ?? "", count: Math.round(s.value) }))
    .filter((c) => c.count !== 0)
    .sort((a, b) => b.count - a.count)
}

function alerts(samples: PromSample[]): HealthAlert[] {
  return samples.map((s) => ({
    name: s.metric.alertname ?? "",
    severity: s.metric.severity ?? "",
    scope: s.metric.process_definition_key ?? s.metric.incident_type ?? s.metric.engine_id ?? "",
  }))
}

/**
 * Live operational health of the engine(s), from the point-in-time gauges plus
 * Prometheus' own `ALERTS` series. A one-call ops snapshot: running WIP, open
 * incidents, dead jobs, job/task/external-task backlog, and which alert rules
 * are firing/pending.
 */
export async function engineHealth(
  ch: PrometheusClient,
  params: { engine?: EngineFilterInput },
): Promise<EngineHealthResult> {
  const sel = selector(engineMatcher(params.engine))
  // ALERTS carries the rule's `engine_id` label (our rules aggregate by it).
  const alertSel = (state: string) =>
    selector(`alertstate="${state}"`, engineMatcher(params.engine))

  const [
    runningByDef,
    incidentsByType,
    deadJobs,
    executableJobs,
    suspendedJobs,
    openTasks,
    unassignedTasks,
    externalTasks,
    deployedKeys,
    firing,
    pending,
  ] = await Promise.all([
    ch.instant(`${M.processInstancesRunning}${sel}`),
    ch.instant(`sum by (incident_type)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum(${M.jobsFailed}${sel})`),
    ch.instant(`sum(${M.jobsExecutable}${sel})`),
    ch.instant(`sum(${M.jobsSuspended}${sel})`),
    ch.instant(
      `sum(${M.userTasksOpen}${selector(`status="total"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(
      `sum(${M.userTasksOpen}${selector(`status="unassigned"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(`sum(${M.externalTasksOpen}${sel})`),
    ch.instant(`count(${M.processDefinitionsDeployed}${sel})`),
    ch.instant(`ALERTS${alertSel("firing")}`),
    ch.instant(`ALERTS${alertSel("pending")}`),
  ])

  const runningByDefinition = counts(runningByDef, "process_definition_key")
  const openIncidentsByType = counts(incidentsByType, "incident_type")
  const firingAlerts = alerts(firing)
  const pendingAlerts = alerts(pending)

  const openIncidents = openIncidentsByType.reduce((s, c) => s + c.count, 0)
  const runningInstances = runningByDefinition.reduce((s, c) => s + c.count, 0)
  const dead = first(deadJobs)

  const status: EngineHealthResult["status"] = firingAlerts.some((a) => a.severity === "critical")
    ? "critical"
    : firingAlerts.length > 0 || dead > 0 || openIncidents > 0
      ? "degraded"
      : "healthy"

  return {
    status,
    statusRule: ENGINE_HEALTH_STATUS_RULE,
    runningInstances,
    runningByDefinition,
    openIncidents,
    openIncidentsByType,
    deadJobs: dead,
    executableJobs: first(executableJobs),
    suspendedJobs: first(suspendedJobs),
    openUserTasks: first(openTasks),
    unassignedUserTasks: first(unassignedTasks),
    openExternalTasks: first(externalTasks),
    deployedDefinitionKeys: first(deployedKeys),
    firingAlerts,
    pendingAlerts,
  }
}
