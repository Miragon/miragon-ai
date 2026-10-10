import {
  engineIdsOf,
  engineMatcher,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"
import { reportingEnginesQuery } from "./helpers.js"

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
 * Name pattern (RE2) of the alert rules this module ships
 * (`playground/docker/prometheus/alerts.yml`). An alert WITHOUT an
 * `engine_id` label — a pipeline-level rule such as `CibSevenEngineNoMetrics`
 * — only counts when it matches this pattern: in a shared Prometheus every
 * other engine-less alert belongs to somebody else.
 */
export const ENGINE_ALERT_NAME_PATTERN = "CibSeven.+"

/**
 * How {@link engineHealth} decides `status`, in words — carried in every
 * result (`statusRule`) and the tool description, so no reader mistakes this
 * alert-based verdict for camunda7_show_engine_health's incident-count one:
 * the two judge different data by different rules and may disagree for the
 * same engine (500 open incidents without a firing critical alert stay
 * "degraded" here).
 */
export const ENGINE_HEALTH_STATUS_RULE =
  "From Prometheus, over the engines in scope: unknown when none of them reports metrics; critical only while a severity=critical alert fires for them (fleet-wide also an engine-less CibSeven* alert); degraded with any such firing alert, dead job, open incident or an engine in scope that reports nothing; else healthy."

export interface EngineHealthResult {
  status: "healthy" | "degraded" | "critical" | "unknown"
  /** How `status` was decided ({@link ENGINE_HEALTH_STATUS_RULE}). */
  statusRule: string
  /** The engine ids judged; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  /**
   * Engines with a live engine-state gauge — Prometheus' 5-minute staleness
   * window makes "present" mean "reported within the last minutes".
   */
  reportingEngines: string[]
  /**
   * Engines in scope that report nothing: the metrics plugin or collector is
   * down, or the engine's `ENGINE_ID` does not match. Every count below reads
   * 0 for them — not because they are idle.
   */
  silentEngines: string[]
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
const total = (s: PromSample[]) => Math.round(s.reduce((sum, x) => sum + x.value, 0))

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
 * The `ALERTS` selection for one alert state. With an engine scope: the
 * alerts carrying one of its `engine_id`s, plus — only for a fleet-wide
 * verdict — this module's engine-less rules. Without one: this module's
 * rules only.
 */
function alertsQuery(state: string, engine: EngineFilterInput, includeFleetAlerts: boolean) {
  const own = `alertname=~"${ENGINE_ALERT_NAME_PATTERN}"`
  const stateMatcher = `alertstate="${state}"`
  const engineSel = engineMatcher(engine)
  if (!engineSel) return `ALERTS${selector(stateMatcher, own)}`
  const scoped = `ALERTS${selector(stateMatcher, engineSel)}`
  return includeFleetAlerts
    ? `${scoped} or ALERTS${selector(stateMatcher, own, `engine_id=""`)}`
    : scoped
}

/**
 * Live operational health of the engine(s), from the point-in-time gauges plus
 * Prometheus' own `ALERTS` series. A one-call ops snapshot: running WIP, open
 * incidents, dead jobs, job/task/external-task backlog, and which alert rules
 * are firing/pending.
 *
 * Absence is not health: the engine-only gauges (`jobs_executable`,
 * `external_tasks_open`) double as the presence probe, so an engine that
 * sends nothing — or an id that matches no series — reads `unknown` (none in
 * scope reports) or lands in `silentEngines` (degrading the verdict), never
 * `healthy`. `includeFleetAlerts` (default: exactly when `engine` is
 * omitted) adds the module's engine-less alerts — set it when `engine` lists
 * the whole configured fleet.
 */
export async function engineHealth(
  ch: PrometheusClient,
  params: { engine?: EngineFilterInput; includeFleetAlerts?: boolean },
): Promise<EngineHealthResult> {
  const sel = selector(engineMatcher(params.engine))
  const fleet = params.includeFleetAlerts ?? engineIdsOf(params.engine) === null

  const [
    runningByDef,
    incidentsByType,
    deadJobs,
    executableByEngine,
    suspendedJobs,
    openTasks,
    unassignedTasks,
    externalByEngine,
    deployedKeys,
    firing,
    pending,
  ] = await Promise.all([
    ch.instant(`sum by (process_definition_key)(${M.processInstancesRunning}${sel})`),
    ch.instant(`sum by (incident_type)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum(${M.jobsFailed}${sel})`),
    ch.instant(reportingEnginesQuery(sel)),
    ch.instant(`sum(${M.jobsSuspended}${sel})`),
    ch.instant(
      `sum(${M.userTasksOpen}${selector(`status="total"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(
      `sum(${M.userTasksOpen}${selector(`status="unassigned"`, engineMatcher(params.engine))})`,
    ),
    ch.instant(`sum by (engine_id)(${M.externalTasksOpen}${sel})`),
    // Distinct keys, not series: a key deployed on two engines counts once.
    ch.instant(`count(count by (process_definition_key)(${M.processDefinitionsDeployed}${sel}))`),
    ch.instant(alertsQuery("firing", params.engine, fleet)),
    ch.instant(alertsQuery("pending", params.engine, fleet)),
  ])

  const runningByDefinition = counts(runningByDef, "process_definition_key")
  const openIncidentsByType = counts(incidentsByType, "incident_type")
  const firingAlerts = alerts(firing)
  const pendingAlerts = alerts(pending)

  const openIncidents = openIncidentsByType.reduce((s, c) => s + c.count, 0)
  const runningInstances = runningByDefinition.reduce((s, c) => s + c.count, 0)
  const dead = first(deadJobs)

  const engines = engineIdsOf(params.engine)
  const reportingEngines = [
    ...new Set(
      [...executableByEngine, ...externalByEngine]
        .map((s) => s.metric.engine_id)
        .filter((id): id is string => !!id),
    ),
  ].sort()
  const silentEngines = (engines ?? []).filter((id) => !reportingEngines.includes(id))

  const status: EngineHealthResult["status"] =
    reportingEngines.length === 0
      ? "unknown"
      : firingAlerts.some((a) => a.severity === "critical")
        ? "critical"
        : firingAlerts.length > 0 || dead > 0 || openIncidents > 0 || silentEngines.length > 0
          ? "degraded"
          : "healthy"

  return {
    status,
    statusRule: ENGINE_HEALTH_STATUS_RULE,
    engines,
    reportingEngines,
    silentEngines,
    runningInstances,
    runningByDefinition,
    openIncidents,
    openIncidentsByType,
    deadJobs: dead,
    executableJobs: total(executableByEngine),
    suspendedJobs: first(suspendedJobs),
    openUserTasks: first(openTasks),
    unassignedUserTasks: first(unassignedTasks),
    openExternalTasks: total(externalByEngine),
    deployedDefinitionKeys: first(deployedKeys),
    firingAlerts,
    pendingAlerts,
  }
}
