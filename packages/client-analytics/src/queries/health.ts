import {
  engineMatcher,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"

export interface HealthCount {
  label: string
  count: number
}

export interface HealthAlert {
  name: string
  severity: string
  scope: string
}

export interface EngineHealthResult {
  status: "healthy" | "degraded" | "critical"
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
    ch.instant(`camunda_process_instances_running${sel}`),
    ch.instant(`sum by (incident_type)(camunda_incidents_open${sel})`),
    ch.instant(`sum(camunda_jobs_failed${sel})`),
    ch.instant(`sum(camunda_jobs_executable${sel})`),
    ch.instant(`sum(camunda_jobs_suspended${sel})`),
    ch.instant(
      `sum(camunda_usertasks_open${selector(`status="total"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(
      `sum(camunda_usertasks_open${selector(`status="unassigned"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(`sum(camunda_external_tasks_open${sel})`),
    ch.instant(`count(camunda_process_definitions_deployed${sel})`),
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
