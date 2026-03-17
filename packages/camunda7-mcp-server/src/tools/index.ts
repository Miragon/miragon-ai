import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { registerListProcessDefinitions } from './list-process-definitions.js';
import { registerGetProcessDefinitionXml } from './get-process-definition-xml.js';
import { registerStartProcessInstance } from './start-process-instance.js';
import { registerListProcessInstances } from './list-process-instances.js';
import { registerGetProcessInstance } from './get-process-instance.js';
import { registerGetActivityInstanceTree } from './get-activity-instance-tree.js';
import { registerDeleteProcessInstance } from './delete-process-instance.js';
import { registerListTasks } from './list-tasks.js';
import { registerGetTask } from './get-task.js';
import { registerClaimTask } from './claim-task.js';
import { registerUnclaimTask } from './unclaim-task.js';
import { registerCompleteTask } from './complete-task.js';
import { registerSetTaskAssignee } from './set-task-assignee.js';
import { registerCorrelateMessage } from './correlate-message.js';
import { registerThrowSignal } from './throw-signal.js';
import { registerGetVariables } from './get-variables.js';
import { registerSetVariable } from './set-variable.js';
import { registerQueryHistoricProcessInstances } from './query-historic-process-instances.js';
import { registerQueryHistoricActivityInstances } from './query-historic-activity-instances.js';
import { registerQueryHistoricTaskInstances } from './query-historic-task-instances.js';
import { registerQueryHistoricVariableInstances } from './query-historic-variable-instances.js';
import { registerListIncidents } from './list-incidents.js';
import { registerResolveIncident } from './resolve-incident.js';
import { registerListJobs } from './list-jobs.js';
import { registerSetJobRetries } from './set-job-retries.js';
import { registerListDeployments } from './list-deployments.js';

export function registerAllTools(server: McpServer, adapter: EngineAdapter): void {
  // Process Definitions
  registerListProcessDefinitions(server, adapter);
  registerGetProcessDefinitionXml(server, adapter);
  registerStartProcessInstance(server, adapter);

  // Process Instances
  registerListProcessInstances(server, adapter);
  registerGetProcessInstance(server, adapter);
  registerGetActivityInstanceTree(server, adapter);
  registerDeleteProcessInstance(server, adapter);

  // User Tasks
  registerListTasks(server, adapter);
  registerGetTask(server, adapter);
  registerClaimTask(server, adapter);
  registerUnclaimTask(server, adapter);
  registerCompleteTask(server, adapter);
  registerSetTaskAssignee(server, adapter);

  // Messages & Signals
  registerCorrelateMessage(server, adapter);
  registerThrowSignal(server, adapter);

  // Variables
  registerGetVariables(server, adapter);
  registerSetVariable(server, adapter);

  // History
  registerQueryHistoricProcessInstances(server, adapter);
  registerQueryHistoricActivityInstances(server, adapter);
  registerQueryHistoricTaskInstances(server, adapter);
  registerQueryHistoricVariableInstances(server, adapter);

  // Incidents & Jobs
  registerListIncidents(server, adapter);
  registerResolveIncident(server, adapter);
  registerListJobs(server, adapter);
  registerSetJobRetries(server, adapter);

  // Deployments
  registerListDeployments(server, adapter);
}
