// Process Definitions
export interface ProcessDefinition {
  id: string;
  key: string;
  name: string | null;
  category: string | null;
  description: string | null;
  version: number;
  resource: string | null;
  deploymentId: string | null;
  diagram: string | null;
  suspended: boolean;
  tenantId: string | null;
  versionTag: string | null;
  historyTimeToLive: number | null;
  startableInTasklist: boolean;
}

export interface ProcessDefinitionFilter {
  key?: string;
  keyLike?: string;
  name?: string;
  nameLike?: string;
  latestVersion?: boolean;
  active?: boolean;
  suspended?: boolean;
  tenantIdIn?: string[];
  sortBy?: 'category' | 'key' | 'id' | 'name' | 'version' | 'deploymentId' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

// Process Instances
export interface ProcessInstance {
  id: string;
  definitionId: string;
  businessKey: string | null;
  caseInstanceId: string | null;
  ended: boolean;
  suspended: boolean;
  tenantId: string | null;
}

export interface ProcessInstanceFilter {
  processDefinitionId?: string;
  processDefinitionKey?: string;
  businessKey?: string;
  active?: boolean;
  suspended?: boolean;
  sortBy?: 'instanceId' | 'definitionKey' | 'definitionId' | 'tenantId' | 'businessKey';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

export interface StartProcessBody {
  businessKey?: string;
  variables?: Record<string, VariableValue>;
}

// Variables
export interface VariableValue {
  value: unknown;
  type?: string;
  valueInfo?: Record<string, unknown>;
}

// User Tasks
export interface Task {
  id: string;
  name: string | null;
  assignee: string | null;
  owner: string | null;
  created: string;
  due: string | null;
  followUp: string | null;
  delegationState: string | null;
  description: string | null;
  executionId: string;
  parentTaskId: string | null;
  priority: number;
  processDefinitionId: string;
  processInstanceId: string;
  caseDefinitionId: string | null;
  caseInstanceId: string | null;
  caseExecutionId: string | null;
  taskDefinitionKey: string;
  suspended: boolean;
  formKey: string | null;
  tenantId: string | null;
}

export interface TaskFilter {
  assignee?: string;
  assigneeLike?: string;
  candidateGroup?: string;
  candidateUser?: string;
  processInstanceId?: string;
  processDefinitionKey?: string;
  processDefinitionId?: string;
  taskDefinitionKey?: string;
  name?: string;
  nameLike?: string;
  active?: boolean;
  unassigned?: boolean;
  sortBy?: 'instanceId' | 'dueDate' | 'executionId' | 'assignee' | 'created' | 'description' | 'id' | 'name' | 'priority' | 'taskDefinitionKey';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

// Messages & Signals
export interface CorrelateMessageBody {
  messageName: string;
  businessKey?: string;
  correlationKeys?: Record<string, VariableValue>;
  processVariables?: Record<string, VariableValue>;
  resultEnabled?: boolean;
}

export interface MessageCorrelationResult {
  resultType: 'Execution' | 'ProcessDefinition';
  execution?: { id: string; processInstanceId: string };
  processInstance?: ProcessInstance;
}

export interface ThrowSignalBody {
  name: string;
  variables?: Record<string, VariableValue>;
}

// History
export interface HistoricProcessInstance {
  id: string;
  businessKey: string | null;
  processDefinitionId: string;
  processDefinitionKey: string;
  processDefinitionName: string | null;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  startUserId: string | null;
  state: 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'EXTERNALLY_TERMINATED' | 'INTERNALLY_TERMINATED';
  tenantId: string | null;
}

export interface HistoricProcessInstanceFilter {
  processDefinitionId?: string;
  processDefinitionKey?: string;
  finished?: boolean;
  unfinished?: boolean;
  startedBefore?: string;
  startedAfter?: string;
  sortBy?: 'instanceId' | 'definitionId' | 'definitionKey' | 'definitionName' | 'startTime' | 'endTime' | 'duration' | 'tenantId' | 'businessKey';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

export interface HistoricActivityInstance {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  processDefinitionId: string;
  processInstanceId: string;
  executionId: string;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  taskId: string | null;
  assignee: string | null;
  canceled: boolean;
  tenantId: string | null;
}

export interface HistoricActivityInstanceFilter {
  processInstanceId?: string;
  processDefinitionId?: string;
  activityType?: string;
  finished?: boolean;
  unfinished?: boolean;
  sortBy?: 'activityInstanceId' | 'instanceId' | 'executionId' | 'activityId' | 'activityName' | 'activityType' | 'startTime' | 'endTime' | 'duration' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

export interface HistoricTaskInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  processInstanceId: string;
  executionId: string;
  name: string | null;
  description: string | null;
  assignee: string | null;
  owner: string | null;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  deleteReason: string | null;
  taskDefinitionKey: string;
  priority: number;
  tenantId: string | null;
}

export interface HistoricTaskFilter {
  processInstanceId?: string;
  processDefinitionKey?: string;
  taskAssignee?: string;
  finished?: boolean;
  unfinished?: boolean;
  sortBy?: 'taskId' | 'activityInstanceId' | 'processDefinitionId' | 'processInstanceId' | 'executionId' | 'duration' | 'endTime' | 'startTime' | 'taskName' | 'taskDescription' | 'assignee' | 'owner' | 'dueDate' | 'followUpDate' | 'deleteReason' | 'taskDefinitionKey' | 'priority' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

export interface HistoricVariableInstance {
  id: string;
  name: string;
  value: unknown;
  type: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  processInstanceId: string;
  activityInstanceId: string | null;
  executionId: string;
  taskId: string | null;
  tenantId: string | null;
  state: string;
  createTime: string;
}

export interface HistoricVariableFilter {
  processInstanceId?: string;
  variableName?: string;
  variableNameLike?: string;
  sortBy?: 'instanceId' | 'variableName' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

// Incidents
export interface Incident {
  id: string;
  processDefinitionId: string;
  processInstanceId: string;
  executionId: string;
  incidentType: string;
  activityId: string;
  causeIncidentId: string;
  rootCauseIncidentId: string;
  configuration: string | null;
  incidentMessage: string | null;
  tenantId: string | null;
  jobDefinitionId: string | null;
  incidentTimestamp: string;
  failedActivityId: string | null;
  annotation: string | null;
}

export interface IncidentFilter {
  incidentType?: string;
  processDefinitionId?: string;
  processInstanceId?: string;
  activityId?: string;
  sortBy?: 'incidentId' | 'incidentMessage' | 'incidentTimestamp' | 'incidentType' | 'executionId' | 'activityId' | 'processInstanceId' | 'processDefinitionId' | 'causeIncidentId' | 'rootCauseIncidentId' | 'configuration' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

// Jobs
export interface Job {
  id: string;
  jobDefinitionId: string | null;
  processInstanceId: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  executionId: string;
  exceptionMessage: string | null;
  retries: number;
  dueDate: string | null;
  suspended: boolean;
  priority: number;
  tenantId: string | null;
  createTime: string;
  failedActivityId: string | null;
}

export interface JobFilter {
  processInstanceId?: string;
  processDefinitionId?: string;
  processDefinitionKey?: string;
  withRetriesLeft?: boolean;
  noRetriesLeft?: boolean;
  active?: boolean;
  suspended?: boolean;
  sortBy?: 'jobId' | 'executionId' | 'processInstanceId' | 'processDefinitionId' | 'processDefinitionKey' | 'jobPriority' | 'jobRetries' | 'jobDueDate' | 'tenantId' | 'createTime';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

// External Tasks
export interface ExternalTask {
  id: string;
  activityId: string;
  activityInstanceId: string;
  errorMessage: string | null;
  executionId: string;
  lockExpirationTime: string | null;
  processDefinitionId: string;
  processDefinitionKey: string;
  processInstanceId: string;
  retries: number | null;
  suspended: boolean;
  workerId: string | null;
  topicName: string;
  tenantId: string | null;
  priority: number;
  businessKey: string | null;
}

export interface FetchAndLockBody {
  workerId: string;
  maxTasks: number;
  topics: Array<{
    topicName: string;
    lockDuration: number;
    variables?: string[];
  }>;
}

export interface CompleteExternalTaskBody {
  workerId: string;
  variables?: Record<string, VariableValue>;
}

export interface HandleFailureBody {
  workerId: string;
  errorMessage?: string;
  errorDetails?: string;
  retries?: number;
  retryTimeout?: number;
}

// Deployments
export interface Deployment {
  id: string;
  name: string | null;
  source: string | null;
  tenantId: string | null;
  deploymentTime: string;
}

export interface DeploymentFilter {
  id?: string;
  name?: string;
  nameLike?: string;
  source?: string;
  tenantIdIn?: string[];
  sortBy?: 'id' | 'name' | 'deploymentTime' | 'tenantId';
  sortOrder?: 'asc' | 'desc';
  firstResult?: number;
  maxResults?: number;
}

export interface CreateDeploymentBody {
  deploymentName: string;
  enableDuplicateFiltering?: boolean;
  deployChangedOnly?: boolean;
  deploymentSource?: string;
  tenantId?: string;
  resources: Array<{ name: string; content: Buffer | Uint8Array }>;
}

// Activity Instance Tree
export interface ActivityInstanceTree {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  processInstanceId: string;
  processDefinitionId: string;
  childActivityInstances: ActivityInstanceTree[];
  childTransitionInstances: TransitionInstance[];
}

export interface TransitionInstance {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  processInstanceId: string;
  processDefinitionId: string;
  executionId: string;
}

// Modification
export interface ModificationBody {
  skipCustomListeners?: boolean;
  skipIoMappings?: boolean;
  instructions: ModificationInstruction[];
}

export interface ModificationInstruction {
  type: 'cancel' | 'startBeforeActivity' | 'startAfterActivity' | 'startTransition';
  activityId?: string;
  transitionId?: string;
  activityInstanceId?: string;
  transitionInstanceId?: string;
  ancestorActivityInstanceId?: string;
  variables?: Record<string, VariableValue>;
}
