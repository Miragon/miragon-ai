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
import type { EngineAdapter } from './adapter.js';
import type { AdapterConfig, EngineType } from './types.js';
import { createHttpClient, type HttpClient } from './http-client.js';

export abstract class BaseAdapter implements EngineAdapter {
  abstract readonly engineType: EngineType;

  protected readonly httpClient: HttpClient;

  constructor(config: AdapterConfig) {
    this.httpClient = createHttpClient({
      baseUrl: config.baseUrl,
      authType: config.authType,
      username: config.username,
      password: config.password,
      token: config.token,
    });
  }

  // Process Definitions
  async listProcessDefinitions(filter?: ProcessDefinitionFilter): Promise<ProcessDefinition[]> {
    return this.httpClient.get('/process-definition', { params: filter as Record<string, unknown> });
  }

  async getProcessDefinitionXml(id: string): Promise<string> {
    const result = await this.httpClient.get<{ bpmn20Xml: string }>(`/process-definition/${id}/xml`);
    return result.bpmn20Xml;
  }

  async startProcessInstance(key: string, body: StartProcessBody): Promise<ProcessInstance> {
    return this.httpClient.post(`/process-definition/key/${key}/start`, { body });
  }

  // Process Instances
  async listProcessInstances(filter?: ProcessInstanceFilter): Promise<ProcessInstance[]> {
    return this.httpClient.post('/process-instance', { body: filter });
  }

  async getProcessInstance(id: string): Promise<ProcessInstance> {
    return this.httpClient.get(`/process-instance/${id}`);
  }

  async getActivityInstanceTree(id: string): Promise<ActivityInstanceTree> {
    return this.httpClient.get(`/process-instance/${id}/activity-instances`);
  }

  async deleteProcessInstance(id: string): Promise<void> {
    await this.httpClient.delete(`/process-instance/${id}`);
  }

  async modifyProcessInstance(id: string, body: ModificationBody): Promise<void> {
    await this.httpClient.post(`/process-instance/${id}/modification`, { body });
  }

  // User Tasks
  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    const { firstResult, maxResults, ...bodyFilter } = filter ?? {};
    return this.httpClient.post('/task', {
      body: bodyFilter,
      params: { firstResult, maxResults } as Record<string, unknown>,
    });
  }

  async getTask(id: string): Promise<Task> {
    return this.httpClient.get(`/task/${id}`);
  }

  async claimTask(id: string, userId: string): Promise<void> {
    await this.httpClient.post(`/task/${id}/claim`, { body: { userId } });
  }

  async unclaimTask(id: string): Promise<void> {
    await this.httpClient.post(`/task/${id}/unclaim`);
  }

  async completeTask(id: string, variables?: Record<string, VariableValue>): Promise<void> {
    await this.httpClient.post(`/task/${id}/complete`, { body: { variables } });
  }

  async setTaskAssignee(id: string, userId: string): Promise<void> {
    await this.httpClient.post(`/task/${id}/assignee`, { body: { userId } });
  }

  // Messages & Signals
  async correlateMessage(body: CorrelateMessageBody): Promise<MessageCorrelationResult[]> {
    return this.httpClient.post('/message', { body });
  }

  async throwSignal(body: ThrowSignalBody): Promise<void> {
    await this.httpClient.post('/signal', { body });
  }

  // Variables
  async getVariables(scope: 'process-instance' | 'task', id: string): Promise<Record<string, VariableValue>> {
    return this.httpClient.get(`/${scope}/${id}/variables`);
  }

  async setVariable(processInstanceId: string, name: string, value: VariableValue): Promise<void> {
    await this.httpClient.put(`/process-instance/${processInstanceId}/variables/${name}`, { body: value });
  }

  // History
  async queryHistoricProcessInstances(filter: HistoricProcessInstanceFilter): Promise<HistoricProcessInstance[]> {
    return this.httpClient.post('/history/process-instance', { body: filter });
  }

  async queryHistoricActivityInstances(filter: HistoricActivityInstanceFilter): Promise<HistoricActivityInstance[]> {
    return this.httpClient.post('/history/activity-instance', { body: filter });
  }

  async queryHistoricTaskInstances(filter: HistoricTaskFilter): Promise<HistoricTaskInstance[]> {
    return this.httpClient.post('/history/task', { body: filter });
  }

  async queryHistoricVariableInstances(filter: HistoricVariableFilter): Promise<HistoricVariableInstance[]> {
    return this.httpClient.post('/history/variable-instance', { body: filter });
  }

  // Incidents & Jobs
  async listIncidents(filter?: IncidentFilter): Promise<Incident[]> {
    return this.httpClient.get('/incident', { params: filter as Record<string, unknown> });
  }

  async resolveIncident(id: string): Promise<void> {
    await this.httpClient.delete(`/incident/${id}`);
  }

  async listJobs(filter?: JobFilter): Promise<Job[]> {
    return this.httpClient.post('/job', { body: filter });
  }

  async setJobRetries(id: string, retries: number): Promise<void> {
    await this.httpClient.put(`/job/${id}/retries`, { body: { retries } });
  }

  // External Tasks
  async fetchAndLock(body: FetchAndLockBody): Promise<ExternalTask[]> {
    return this.httpClient.post('/external-task/fetchAndLock', { body });
  }

  async completeExternalTask(id: string, body: CompleteExternalTaskBody): Promise<void> {
    await this.httpClient.post(`/external-task/${id}/complete`, { body });
  }

  async handleExternalTaskFailure(id: string, body: HandleFailureBody): Promise<void> {
    await this.httpClient.post(`/external-task/${id}/failure`, { body });
  }

  // Deployments
  async listDeployments(filter?: DeploymentFilter): Promise<Deployment[]> {
    return this.httpClient.get('/deployment', { params: filter as Record<string, unknown> });
  }

  async createDeployment(body: CreateDeploymentBody): Promise<Deployment> {
    const formData = new FormData();
    formData.set('deployment-name', body.deploymentName);
    if (body.enableDuplicateFiltering !== undefined) {
      formData.set('enable-duplicate-filtering', String(body.enableDuplicateFiltering));
    }
    if (body.deployChangedOnly !== undefined) {
      formData.set('deploy-changed-only', String(body.deployChangedOnly));
    }
    if (body.deploymentSource !== undefined) {
      formData.set('deployment-source', body.deploymentSource);
    }
    if (body.tenantId !== undefined) {
      formData.set('tenant-id', body.tenantId);
    }
    for (const resource of body.resources) {
      formData.set(resource.name, new Blob([resource.content as BlobPart]), resource.name);
    }
    return this.httpClient.postMultipart('/deployment/create', formData);
  }
}
