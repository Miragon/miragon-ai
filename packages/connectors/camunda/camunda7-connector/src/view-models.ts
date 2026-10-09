/**
 * View-model contracts shared between the `src/data` builders, the widget
 * tools, and the React widgets (`src/widgets`). These shapes describe what the
 * widgets render — they are not engine API types (those live in
 * `@miragon-ai/camunda7-client/types`).
 */

export interface IncidentStat {
  incidentType: string
  incidentCount: number
}

/**
 * One process definition KEY of the cockpit landscape: every count spans all
 * deployed versions (old versions keep running after a redeploy).
 */
export interface DefinitionStat {
  /** Id of the latest version — the row's link target. */
  id: string
  key: string
  name: string | null
  latestVersion: number
  instances: number
  failedJobs: number
  incidents: IncidentStat[]
}

export interface CockpitDashboardData {
  summary: {
    /** Deployed definition KEYS (not versions). */
    totalDefinitions: number
    totalRunningInstances: number
    totalFailedJobs: number
    totalIncidents: number
  }
  definitions: DefinitionStat[]
  engineId?: string
}

export interface TaskData {
  id: string
  name: string | null
  assignee: string | null
  created: string
  due: string | null
  priority: number
  processDefinitionId: string
  processInstanceId: string
  taskDefinitionKey: string
  description: string | null
}

export type TaskFormFieldSource = "form-data" | "manual"

export interface TaskFormField {
  name: string
  type?: string
  label?: string
  defaultValue?: unknown
  suggestedValues?: unknown[]
  required?: boolean
  readonly?: boolean
  source: TaskFormFieldSource
}

export interface TaskFormSchema {
  taskId: string
  fields: TaskFormField[]
  /** The task's own form (embedded/external/Camunda Form) — set only without form fields. */
  formKey?: string
  /** Key of a Camunda Form the task links (`camunda:formRef`) — set only without form fields or formKey. */
  formRef?: string
}

export interface OpenUserTask extends TaskData {
  /**
   * Null when the server could not build it (the BPMN was unreadable) — the
   * form then loads it through `camunda7_get_task_form`, never as "no form".
   */
  formSchema: TaskFormSchema | null
}

export interface TaskDashboardData {
  tasks: TaskData[]
  totalCount: number
  filters: {
    assignee?: string
    candidateGroup?: string
    processDefinitionKey?: string
  }
  engineId?: string
}

export interface Job {
  id: string
  processInstanceId: string
  processDefinitionKey: string | null
  processDefinitionId: string | null
  activityId: string | null
  retries: number
  exceptionMessage: string | null
  dueDate: string | null
  suspended: boolean
  priority: number
  createTime: string | null
}

export interface JobPanelData {
  totalCount: number
  failedCount: number
  jobs: Job[]
  /** Filters this page was built with — standalone renders get only `data`,
   *  so loadMore/search must rebuild the feed args from this echo. */
  filters: {
    processDefinitionKey?: string
    failedOnly?: boolean
  }
  engineId?: string
}

export interface ActivityStat {
  id: string
  instances: number
  failedJobs: number
}

export interface BpmnViewerData {
  /** The rendered version's diagram — null when it could not be read (enrichment). */
  bpmnXml: string | null
  processInstanceId: string | null
  processDefinitionId: string | null
  activeActivityIds: string[]
  incidentActivityIds: string[]
  /** Per-activity token and failed-job counts, scoped by {@link statsScope}. */
  activityStats: ActivityStat[]
  /**
   * Whose counts `activityStats` are: `"instance"` — this instance's own
   * tokens and failed jobs; `"definition"` — every running instance of the
   * rendered definition version.
   */
  statsScope: "instance" | "definition"
  engineId?: string
}

export interface ProcessDefinition {
  id: string
  key: string
  name: string | null
  version: number
  deploymentId: string | null
  suspended: boolean
  versionTag: string | null
  tenantId: string | null
}

export interface ProcessListData {
  definitions: ProcessDefinition[]
  totalCount: number
  /** Filters this page was built with — standalone renders get only `data`,
   *  so loadMore/search must rebuild the feed args from this echo (a page-2
   *  fetch without `latestVersion` would mix all versions into a latest-only
   *  page 0). */
  filters: {
    processDefinitionKey?: string
    nameLike?: string
    latestVersion: boolean
  }
  engineId?: string
}

export interface ProcessInstanceRow {
  id: string
  businessKey: string | null
  /** Definition key this instance runs on (parsed from definitionId) — the
   *  engine-wide list renders it as its own drillable column. */
  processDefinitionKey: string | null
  /** Definition version this instance runs on (parsed from definitionId). */
  version: number | null
  suspended: boolean
  /** Whether this instance currently has at least one open incident. */
  hasIncident: boolean
}

export interface CockpitEngineInfo {
  id: string
  /** Environment grouping for the two-stage picker (default environment when unconfigured). */
  environment: string
}

/**
 * Bootstrap payload for the consolidated cockpit app (`camunda7_open_cockpit`).
 * Carries the resolved engine (the caller's saved default or the only
 * configured engine) plus the full engine list so the app can offer a
 * switcher / picker. The app threads the chosen `engineId` into every nested
 * tool call via the `engine` override, so client-side navigation works
 * regardless of the saved default.
 */
export interface CockpitAppData {
  /** Resolved engine id, or null when the user must pick (multiple engines, none selected). */
  engineId: string | null
  engines: CockpitEngineInfo[]
}

export interface ProcessInstancesData {
  /** Null → the engine-wide list (no definition scope). */
  processDefinitionKey: string | null
  processDefinitionName: string | null
  /** Total matching instances on the engine (may exceed `instances.length`). */
  totalCount: number
  /** Instances actually returned (capped at the tool's maxResults). */
  returnedCount: number
  /** Of `totalCount` (the whole filtered set, not the page): instances with an open incident. */
  withIncidentCount: number
  /** Of `totalCount` (the whole filtered set, not the page): suspended instances. */
  suspendedCount: number
  instances: ProcessInstanceRow[]
  filters: {
    active?: boolean
    suspended?: boolean
    withIncidents?: boolean
    businessKeyLike?: string
  }
  engineId?: string
}

export interface VariableValue {
  value: unknown
  type?: string
  valueInfo?: Record<string, unknown>
}

/**
 * What clears an incident — the engine contract's `incidentRecovery`
 * (`@miragon-ai/camunda7-client`): the built-in types are retried
 * (`camunda7_set_job_retries` / `camunda7_set_external_task_retries`), only
 * custom ones resolved; `none` = propagated from a called instance, cleared by
 * retrying its root cause.
 */
export type IncidentRecovery =
  | { action: "resolve" }
  | { action: "retry-job"; jobId: string }
  | { action: "retry-external-task"; externalTaskId: string }
  | { action: "none" }

export interface IncidentInstance {
  id: string
  processInstanceId: string
  incidentType: string
  incidentMessage: string | null
  incidentTimestamp: string
  /**
   * Always set by the feeds — optional because a result stored before it
   * existed reaches the current view as is (a reopened conversation). Read it
   * through `recoveryOf` (`widgets/lib/incident-recovery.ts`).
   */
  recovery?: IncidentRecovery
  /** Pre-built jump-out URL into the Cockpit instance page. Null when no
   *  cockpitUrl is configured or scheme validation rejected the input. */
  cockpitInstanceUrl: string | null
}

export interface ActivityTree {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  childActivityInstances: ActivityTree[]
}

export interface InstanceDetailData {
  instance: {
    id: string
    definitionId: string
    businessKey: string | null
    suspended: boolean
    ended: boolean
  }
  activityTree: ActivityTree | null
  variables: Record<string, VariableValue>
  /** The instance's open incidents (capped list; the total is `incidentCount`). */
  incidents: IncidentInstance[]
  incidentCount: number
  bpmnXml: string | null
  activeActivityIds: string[]
  incidentActivityIds: string[]
  /** The instance's open user tasks (capped list; the total is `openTaskCount`). */
  openTasks: OpenUserTask[]
  openTaskCount: number
  engineId?: string
}

export interface DeploymentResource {
  id: string
  name: string
}

export interface Deployment {
  id: string
  name: string | null
  deploymentTime: string
  source: string | null
  tenantId: string | null
  resources: DeploymentResource[]
}

export interface DeploymentBrowserData {
  totalCount: number
  deployments: Deployment[]
  engineId?: string
}

export interface ActivityData {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  assignee: string | null
  taskId: string | null
}

export interface HistoricProcessInstance {
  id: string
  processDefinitionKey: string
  processDefinitionName: string | null
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  state: string
}

export interface HistoryTimelineData {
  processInstance: HistoricProcessInstance | null
  activities: ActivityData[]
  totalActivities: number
  engineId?: string
}

// === Overview (camunda7_show_incidents_dashboard)

/**
 * One activity with open incidents, as the incident views group them. The
 * timestamps and the message come from the newest-first recency scan — facts
 * it cannot vouch for are null (rendered "—"), never a guess.
 */
export interface IncidentActivityFacts {
  activityId: string
  /** Display name from the diagram — null without one (or for an activity only older versions have). */
  activityName: string | null
  /** Newest scanned failure message — null when the activity's incidents lie beyond the scan. */
  representativeMessage: string | null
  /** Null unless the scan holds ALL of the activity's incidents. */
  firstSeen: string | null
  /** Null when the activity's incidents lie beyond the scan. */
  latestIncident: string | null
}

/**
 * One activity of a dashboard card's breakdown — drawn from the recency scan,
 * so it covers the card's `scannedIncidentCount` incidents.
 */
export interface IncidentsDashboardActivity extends IncidentActivityFacts {
  /** This activity's incidents within the scan (exact when the card is fully scanned). */
  scannedIncidentCount: number
  /** Incidents since now − 24h; null when the scan does not reach back that far. */
  last24hCount: number | null
}

/** One process definition KEY with open incidents — every count spans all versions. */
export interface IncidentsDashboardProcess {
  processDefinitionKey: string
  processDefinitionName: string | null
  latestVersion: number
  runningInstances: number
  /** Exact open incidents of the key (definition statistics). */
  incidentCount: number
  /** How many of `incidentCount` the per-activity breakdown covers (the recency scan's share). */
  scannedIncidentCount: number
  /** Null unless the breakdown covers every incident of the key. */
  affectedActivityCount: number | null
  /** Null when the scan does not reach back 24h. */
  last24hCount: number | null
  /** Null when none of the key's incidents is within the scan. */
  latestIncident: string | null
  cockpitUrl: string | null
  activities: IncidentsDashboardActivity[]
}

export interface IncidentsDashboardData {
  totalCount: number
  processCount: number
  /** Null unless every card's breakdown is complete. */
  affectedActivityCount: number | null
  last24hCount: number
  latestIncident: string | null
  processes: IncidentsDashboardProcess[]
  engineId?: string
}

export interface IncidentsByProcess {
  processDefinitionKey: string
  processDefinitionName: string | null
  incidentCount: number
}

// === Unified definition view (camunda7_show_process_detail / camunda7_show_process_incidents)

/** One activity group of the definition view. */
export interface ProcessIncidentsActivity extends IncidentActivityFacts {
  /** Exact open incidents of this activity over every version of the key. */
  incidentCount: number
}

/** One page of an activity's incident rows (camunda7_activity_incidents_data). */
export interface ActivityIncidentsData {
  processDefinitionKey: string
  activityId: string
  /** The requested page, newest first. */
  incidents: IncidentInstance[]
  /** Exact total for this activity from /incident/count. */
  totalCount: number
  engineId: string
}

/**
 * The unified definition view of ONE process definition KEY. Every count
 * spans all deployed versions; only the diagram is one version
 * (`diagramVersion`, the latest).
 */
export interface ProcessIncidentsData {
  processDefinitionKey: string
  processDefinitionName: string | null
  /** Version of `bpmnXml` — the latest deployed; the counts cover every version. */
  diagramVersion: number
  bpmnXml: string | null
  cockpitUrl: string | null
  runningInstances: number
  incidentCount: number
  last24hCount: number
  /** Jobs with no retries left, over every version of the key. */
  failedJobs: number
  /** Activities in the diagram — null when the diagram is unavailable. */
  totalActivityCount: number | null
  latestIncident: string | null
  activities: ProcessIncidentsActivity[]
  /** Other process definitions with open incidents — surfaced in the empty
   *  state so the operator can jump to where the incidents actually are.
   *  Null when they could not be read. */
  siblingsWithIncidents: IncidentsByProcess[] | null
  engineId?: string
}

// === Single-incident detail (camunda7_show_incident_detail)

export interface IncidentDetailJob {
  id: string
  retries: number
  exceptionMessage: string | null
  /** Full stacktrace from `/job/{id}/stacktrace`. May be null if the engine
   *  rejected the request or the incident is not job-backed. */
  stacktrace: string | null
  dueDate: string | null
}

export interface IncidentDetailData {
  // Header
  incidentId: string
  incidentType: string
  incidentMessage: string | null
  incidentTimestamp: string
  activityId: string
  activityName: string | null

  // Process / instance context
  processDefinitionKey: string
  processDefinitionId: string
  processDefinitionName: string | null
  processDefinitionVersion: number | null
  processInstanceId: string
  businessKey: string | null
  /** Direct deep-link to the instance in the Cockpit (null if no cockpit URL configured). */
  cockpitInstanceUrl: string | null

  // BPMN
  bpmnXml: string | null

  // Failure tab — null when the incident has no associated job (e.g. external-task incidents)
  job: IncidentDetailJob | null
  /**
   * What clears it — retry for the built-in types, resolve for custom ones.
   * Optional like {@link IncidentInstance.recovery}: read it through `recoveryOf`.
   */
  recovery?: IncidentRecovery

  // Instance tab — same shape as InstanceDetailData
  instance: {
    id: string
    definitionId: string
    businessKey: string | null
    suspended: boolean
    ended: boolean
  }
  activityTree: ActivityTree | null
  variables: Record<string, VariableValue>

  /** Total historic activity instances (KPI) — the History tab pages the rows
   *  itself via `camunda7_query_historic_activity_instances`. Null when the
   *  history API is unavailable (history level "none"). */
  historyTotalCount: number | null

  engineId?: string
}

// === Engine health verdict (camunda7_show_engine_health) ===

export type EngineHealthStatus = "ok" | "degraded" | "critical"

/**
 * A cross-process incident cluster: the same activity failing the same way
 * (`activityId` + `incidentType` + normalized failure-message signature) across
 * one or more process definitions. This is the root-cause unit a support
 * operator triages — surfaced instead of a flat per-instance incident list. The
 * plain-language interpretation and the recommended fix are the host agent's
 * job (the "ask the AI" handoff), not the server's: the cluster carries only
 * deterministic, grounded facts.
 */
export interface EngineHealthCluster {
  /** Stable key `${activityId}::${incidentType}::${messageSignature}` — used for React keys. */
  id: string
  activityId: string
  incidentType: string
  /** Normalized failure-message signature — the third clustering dimension; drill filter. */
  messageSignature: string
  incidentCount: number
  last24hCount: number
  /** Distinct process definition keys this cluster spans, most-affected first. */
  processDefinitionKeys: string[]
  /** A sample message + its incident id, for the drill-in and the AI prompt. */
  representativeMessage: string | null
  representativeIncidentId: string
  latestIncident: string | null
}

export interface EngineHealthData {
  /** Deterministic traffic-light verdict from incident volume + cluster size. */
  status: EngineHealthStatus
  /** How `status` was decided, in words (source + thresholds) — `healthVerdictRule`. */
  statusRule: string
  /** Deterministic plain-language headline, e.g. "Degraded — 51 open incidents across 3 activities". */
  headline: string
  summary: {
    totalIncidents: number
    /** New incidents in the last hour — the "is it burning right now?" signal. */
    lastHourIncidents: number
    last24hIncidents: number
    /** Activities with open incidents — null unless the incident scan read every incident. */
    affectedActivities: number | null
    /** Definition keys with open incidents. */
    affectedDefinitions: number
    runningInstances: number
    /** Deployed definition keys. */
    totalDefinitions: number
    /** Instances started in the last 24h — null when the history API is unavailable. */
    started24h: number | null
    /** Instances completed in the last 24h — null when the history API is unavailable. */
    completed24h: number | null
  }
  /** Top incident clusters by count (cross-process), most severe first. */
  clusters: EngineHealthCluster[]
  /** When this snapshot was computed (ISO) — rendered as "as of …" for ops trust. */
  fetchedAt: string
  engineId: string
}

// === Cluster detail (camunda7_show_cluster_detail) ===

export interface ClusterIncidentRow {
  incidentId: string
  processInstanceId: string
  /** Business key of the affected instance — the operator's "order number". */
  businessKey: string | null
  processDefinitionKey: string
  incidentTimestamp: string
}

/**
 * Drill-in for ONE failure cluster: the affected instances (business keys
 * first), the full sample message, and the time profile — the middle layer
 * between the engine overview's cluster list and the single-incident detail.
 */
export interface ClusterDetailData {
  activityId: string
  incidentType: string
  /** Signature the result was filtered by; null = no message filter (activity+type only). */
  messageSignature: string | null
  incidentCount: number
  lastHourCount: number
  last24hCount: number
  firstSeen: string | null
  latestIncident: string | null
  /** Distinct process definition keys, most-affected first. */
  processDefinitionKeys: string[]
  representativeMessage: string | null
  /** First page of affected incidents (most recent first). */
  incidents: ClusterIncidentRow[]
  /** Total matching incidents (may exceed `incidents.length`). */
  totalMatching: number
  fetchedAt: string
  engineId: string
}
