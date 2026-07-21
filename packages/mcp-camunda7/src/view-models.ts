/**
 * View-model contracts shared between the `src/data` builders, the widget
 * tools, and the React widgets (`src/widgets`). These shapes describe what the
 * widgets render — they are not engine API types (those live in
 * `@miragon-ai/client-camunda7/types`).
 */

export interface IncidentStat {
  incidentType: string
  incidentCount: number
}

export interface DefinitionStat {
  id: string
  key: string
  name: string | null
  version: number
  instances: number
  failedJobs: number
  incidents: IncidentStat[]
}

export interface CockpitDashboardData {
  summary: {
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
}

export interface OpenUserTask extends TaskData {
  formSchema: TaskFormSchema
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
  engineId?: string
}

export interface ActivityStat {
  id: string
  instances: number
  failedJobs: number
}

export interface BpmnViewerData {
  bpmnXml: string
  processInstanceId: string | null
  processDefinitionId: string | null
  activeActivityIds: string[]
  incidentActivityIds: string[]
  activityStats: ActivityStat[]
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
  engineId?: string
}

export interface ProcessInstanceRow {
  id: string
  businessKey: string | null
  /** Definition version this instance runs on (parsed from definitionId). */
  version: number | null
  suspended: boolean
  /** Whether this instance currently has at least one open incident. */
  hasIncident: boolean
}

export interface CockpitEngineInfo {
  id: string
  baseUrl: string
}

/**
 * Bootstrap payload for the consolidated cockpit app (`camunda7_open_cockpit`).
 * Carries the resolved engine (sticky selection or the only configured engine)
 * plus the full engine list so the app can offer a switcher / picker. The app
 * threads the chosen `engineId` into every nested tool call via the `engine`
 * override, so client-side navigation works regardless of the session's sticky
 * selection.
 */
export interface CockpitAppData {
  /** Resolved engine id, or null when the user must pick (multiple engines, none selected). */
  engineId: string | null
  engines: CockpitEngineInfo[]
}

export interface ProcessInstancesData {
  processDefinitionKey: string
  processDefinitionName: string | null
  /** Total matching instances on the engine (may exceed `instances.length`). */
  totalCount: number
  /** Instances actually returned (capped at the tool's maxResults). */
  returnedCount: number
  withIncidentCount: number
  suspendedCount: number
  instances: ProcessInstanceRow[]
  filters: {
    active?: boolean
    suspended?: boolean
    withIncidentsOnly?: boolean
    businessKeyLike?: string
  }
  engineId?: string
}

export interface VariableValue {
  value: unknown
  type?: string
  valueInfo?: Record<string, unknown>
}

export interface IncidentInstance {
  id: string
  processInstanceId: string
  incidentType: string
  incidentMessage: string | null
  incidentTimestamp: string
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
  incidents?: IncidentInstance[]
  bpmnXml: string | null
  activeActivityIds: string[]
  incidentActivityIds: string[]
  openTasks: OpenUserTask[]
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

export interface IncidentsDashboardActivity {
  activityId: string
  activityName: string | null
  representativeMessage: string | null
  incidentCount: number
  /** Subset of incidents with `incidentTimestamp >= now - 24h`. Used to keep the
   *  "Last 24h" filter chip honest when it recomputes the card-level total. */
  last24hCount: number
  firstSeen: string | null
  latestIncident: string | null
}

export interface IncidentsDashboardProcess {
  processDefinitionKey: string
  processDefinitionName: string | null
  version: number | null
  runningInstances: number | null
  totalActivityCount: number | null
  affectedActivityCount: number
  incidentCount: number
  last24hCount: number
  latestIncident: string | null
  cockpitUrl: string | null
  activities: IncidentsDashboardActivity[]
}

export interface IncidentsDashboardData {
  totalCount: number
  processCount: number
  affectedActivityCount: number
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

// === Process definition detail (camunda7_show_process_detail)

export interface ProcessDetailActivity {
  activityId: string
  activityName: string | null
  /** Running token count at this activity — drives the diagram heatmap badges. */
  instances: number
  incidentCount: number
  failedJobs: number
}

export interface ProcessDetailData {
  processDefinitionKey: string
  processDefinitionName: string | null
  version: number | null
  bpmnXml: string | null
  cockpitUrl: string | null
  runningInstances: number | null
  openIncidents: number
  failedJobs: number
  totalActivityCount: number | null
  affectedActivityCount: number
  activities: ProcessDetailActivity[]
  engineId?: string
}

// === Detail (camunda7_show_process_incidents)

export interface ProcessIncidentsActivity {
  activityId: string
  activityName: string | null
  representativeMessage: string | null
  incidentCount: number
  firstSeen: string | null
  latestIncident: string | null
  incidents: IncidentInstance[]
}

export interface ProcessIncidentsData {
  processDefinitionKey: string
  processDefinitionName: string | null
  version: number | null
  bpmnXml: string | null
  cockpitUrl: string | null
  runningInstances: number | null
  incidentCount: number
  last24hCount: number
  totalActivityCount: number | null
  latestIncident: string | null
  activities: ProcessIncidentsActivity[]
  /** Other process definitions with open incidents — surfaced in the empty
   *  state so the operator can jump to where the incidents actually are. */
  siblingsWithIncidents: IncidentsByProcess[]
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

export interface IncidentDetailHistoryEntry {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  canceled: boolean
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

  // History tab
  history: IncidentDetailHistoryEntry[]

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
  /** Deterministic plain-language headline, e.g. "Degraded — 51 open incidents across 3 activities". */
  headline: string
  summary: {
    totalIncidents: number
    /** New incidents in the last hour — the "is it burning right now?" signal. */
    lastHourIncidents: number
    last24hIncidents: number
    affectedActivities: number
    affectedDefinitions: number
    runningInstances: number
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
