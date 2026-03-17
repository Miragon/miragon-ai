import type {
  ProcessDefinition, ProcessDefinitionFilter,
  ProcessInstance, ProcessInstanceFilter, StartProcessBody,
  Task, TaskFilter,
  VariableValue,
  CorrelateMessageBody, MessageCorrelationResult, ThrowSignalBody,
  HistoricProcessInstance, HistoricProcessInstanceFilter,
  HistoricActivityInstance, HistoricActivityInstanceFilter,
  HistoricTaskInstance, HistoricTaskFilter,
  HistoricVariableInstance, HistoricVariableFilter,
  Incident, IncidentFilter,
  Job, JobFilter,
  ExternalTask, FetchAndLockBody, CompleteExternalTaskBody, HandleFailureBody,
  Deployment, DeploymentFilter, CreateDeploymentBody,
  ActivityInstanceTree, ModificationBody,
} from '@camunda7-mcp/shared';
import type { EngineType } from './types.js';

export interface EngineAdapter {
  readonly engineType: EngineType;

  // Process Definitions
  listProcessDefinitions(filter?: ProcessDefinitionFilter): Promise<ProcessDefinition[]>;
  getProcessDefinitionXml(id: string): Promise<string>;
  startProcessInstance(key: string, body: StartProcessBody): Promise<ProcessInstance>;

  // Process Instances
  listProcessInstances(filter?: ProcessInstanceFilter): Promise<ProcessInstance[]>;
  getProcessInstance(id: string): Promise<ProcessInstance>;
  getActivityInstanceTree(id: string): Promise<ActivityInstanceTree>;
  deleteProcessInstance(id: string): Promise<void>;
  modifyProcessInstance(id: string, body: ModificationBody): Promise<void>;

  // User Tasks
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  claimTask(id: string, userId: string): Promise<void>;
  unclaimTask(id: string): Promise<void>;
  completeTask(id: string, variables?: Record<string, VariableValue>): Promise<void>;
  setTaskAssignee(id: string, userId: string): Promise<void>;

  // Messages & Signals
  correlateMessage(body: CorrelateMessageBody): Promise<MessageCorrelationResult[]>;
  throwSignal(body: ThrowSignalBody): Promise<void>;

  // Variables
  getVariables(scope: 'process-instance' | 'task', id: string): Promise<Record<string, VariableValue>>;
  setVariable(processInstanceId: string, name: string, value: VariableValue): Promise<void>;

  // History
  queryHistoricProcessInstances(filter: HistoricProcessInstanceFilter): Promise<HistoricProcessInstance[]>;
  queryHistoricActivityInstances(filter: HistoricActivityInstanceFilter): Promise<HistoricActivityInstance[]>;
  queryHistoricTaskInstances(filter: HistoricTaskFilter): Promise<HistoricTaskInstance[]>;
  queryHistoricVariableInstances(filter: HistoricVariableFilter): Promise<HistoricVariableInstance[]>;

  // Incidents & Jobs
  listIncidents(filter?: IncidentFilter): Promise<Incident[]>;
  resolveIncident(id: string): Promise<void>;
  listJobs(filter?: JobFilter): Promise<Job[]>;
  setJobRetries(id: string, retries: number): Promise<void>;

  // External Tasks
  fetchAndLock(body: FetchAndLockBody): Promise<ExternalTask[]>;
  completeExternalTask(id: string, body: CompleteExternalTaskBody): Promise<void>;
  handleExternalTaskFailure(id: string, body: HandleFailureBody): Promise<void>;

  // Deployments
  listDeployments(filter?: DeploymentFilter): Promise<Deployment[]>;
  createDeployment(body: CreateDeploymentBody): Promise<Deployment>;
}
