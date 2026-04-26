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

export interface TaskDashboardData {
  tasks: TaskData[]
  totalCount: number
  filters: {
    assignee?: string
    candidateGroup?: string
    processDefinitionKey?: string
  }
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
}
