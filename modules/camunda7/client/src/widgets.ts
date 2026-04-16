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

export interface IncidentData {
  id: string
  processDefinitionId: string
  processInstanceId: string
  incidentType: string
  activityId: string
  incidentMessage: string | null
  incidentTimestamp: string
  configuration: string | null
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
  incidents?: IncidentData[]
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

export interface DefinitionGroup {
  processDefinitionKey: string
  incidentCount: number
  latestIncident: string
  incidents: IncidentData[]
}

export interface IncidentPanelData {
  totalCount: number
  definitions: DefinitionGroup[]
}
