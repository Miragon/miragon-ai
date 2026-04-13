// Auto-generated tool registry types - DO NOT EDIT MANUALLY
// This file is regenerated whenever tools are added, removed, or updated during development
// Generated at: 2026-04-13T21:16:01.986Z

declare module "mcp-use/react" {
  interface ToolRegistry {
    "analytics_analyze_process_performance": {
      input: { "processDefinitionKey": string; "period": "1d" | "7d" | "30d" | "90d"; "includeActivityBreakdown": boolean };
      output: Record<string, unknown>;
    };
    "analytics_compare_execution_periods": {
      input: { "processDefinitionKey": string; "periodAFrom": string; "periodATo": string; "periodBFrom": string; "periodBTo": string; "includeActivityBreakdown": boolean };
      output: Record<string, unknown>;
    };
    "analytics_find_failed_instances": {
      input: { "processDefinitionKey"?: string | undefined; "period": "1d" | "7d" | "30d"; "incidentType"?: string | undefined; "groupByError": boolean; "limit": number };
      output: Record<string, unknown>;
    };
    "analytics_search_by_variable": {
      input: { "variableName": string; "variableValue": string; "processDefinitionKey"?: string | undefined; "limit": number };
      output: Record<string, unknown>;
    };
    "analytics_search_process_instances": {
      input: { "processDefinitionKey"?: string | undefined; "businessKey"?: string | undefined; "state"?: "ACTIVE" | "COMPLETED" | "INTERNALLY_TERMINATED" | "EXTERNALLY_TERMINATED" | undefined; "startedAfter"?: string | undefined; "startedBefore"?: string | undefined; "durationGreaterThan"?: number | undefined; "withIncidents"?: boolean | undefined; "variableName"?: string | undefined; "variableValue"?: string | undefined; "sortBy": "startTime" | "endTime" | "duration"; "sortOrder": "asc" | "desc"; "limit": number };
      output: Record<string, unknown>;
    };
    "analytics_show_dashboard": {
      input: { "processDefinitionKey"?: string | undefined; "period": "1d" | "7d" | "30d" | "90d" };
      output: Record<string, unknown>;
    };
    "analytics_trace_process_execution": {
      input: { "processInstanceId": string; "includeOtelSpans": boolean; "includeActivityHistory": boolean; "includeVariableChanges": boolean };
      output: Record<string, unknown>;
    };
    "camunda7_claim_task": {
      input: { "taskId": string; "userId": string };
      output: Record<string, unknown>;
    };
    "camunda7_complete_external_task": {
      input: { "externalTaskId": string; "workerId": string; "variables"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_complete_task": {
      input: { "taskId": string; "variables"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_correlate_message": {
      input: { "messageName": string; "businessKey"?: string | undefined; "correlationKeys"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined; "processVariables"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined; "resultEnabled": boolean | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_create_deployment": {
      input: { "deploymentName": string; "enableDuplicateFiltering"?: boolean | undefined; "deployChangedOnly"?: boolean | undefined; "deploymentSource"?: string | undefined; "tenantId"?: string | undefined; "resources": Array<{ "name": string; "content": string }> };
      output: Record<string, unknown>;
    };
    "camunda7_delete_process_instance": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_fetch_and_lock": {
      input: { "workerId": string; "maxTasks": number; "topics": Array<{ "topicName": string; "lockDuration": number; "variables"?: Array<string> | undefined }> };
      output: Record<string, unknown>;
    };
    "camunda7_get_activity_instance_tree": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_get_process_definition_xml": {
      input: { "processDefinitionId": string };
      output: Record<string, unknown>;
    };
    "camunda7_get_process_instance": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_get_process_instance_variables": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_get_task": {
      input: { "taskId": string };
      output: Record<string, unknown>;
    };
    "camunda7_get_task_variables": {
      input: { "taskId": string };
      output: Record<string, unknown>;
    };
    "camunda7_handle_external_task_failure": {
      input: { "externalTaskId": string; "workerId": string; "errorMessage"?: string | undefined; "errorDetails"?: string | undefined; "retries"?: number | undefined; "retryTimeout"?: number | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_deployments": {
      input: { "name"?: string | undefined; "nameLike"?: string | undefined; "maxResults": number | undefined; "sortBy"?: "id" | "name" | "deploymentTime" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_incidents": {
      input: { "processInstanceId"?: string | undefined; "processDefinitionId"?: string | undefined; "incidentType"?: string | undefined; "maxResults": number | undefined; "sortBy"?: "incidentId" | "incidentMessage" | "incidentTimestamp" | "incidentType" | "executionId" | "activityId" | "processInstanceId" | "processDefinitionId" | "causeIncidentId" | "rootCauseIncidentId" | "configuration" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_jobs": {
      input: { "processInstanceId"?: string | undefined; "processDefinitionKey"?: string | undefined; "withRetriesLeft"?: boolean | undefined; "noRetriesLeft"?: boolean | undefined; "active"?: boolean | undefined; "suspended"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "jobId" | "executionId" | "processInstanceId" | "processDefinitionId" | "processDefinitionKey" | "jobPriority" | "jobRetries" | "jobDueDate" | "tenantId" | "createTime" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_process_definitions": {
      input: { "key"?: string | undefined; "nameLike"?: string | undefined; "latestVersion"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "category" | "key" | "id" | "name" | "version" | "deploymentId" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_process_instances": {
      input: { "processDefinitionKey"?: string | undefined; "businessKey"?: string | undefined; "active"?: boolean | undefined; "suspended"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "instanceId" | "definitionKey" | "definitionId" | "tenantId" | "businessKey" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_list_tasks": {
      input: { "assignee"?: string | undefined; "candidateGroup"?: string | undefined; "processDefinitionKey"?: string | undefined; "processInstanceId"?: string | undefined; "unassigned"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "instanceId" | "dueDate" | "executionId" | "assignee" | "created" | "description" | "id" | "name" | "priority" | "taskDefinitionKey" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_modify_process_instance": {
      input: { "processInstanceId": string; "skipCustomListeners"?: boolean | undefined; "skipIoMappings"?: boolean | undefined; "instructions": Array<{ "type": "cancel" | "startBeforeActivity" | "startAfterActivity" | "startTransition"; "activityId"?: string | undefined; "transitionId"?: string | undefined; "activityInstanceId"?: string | undefined; "transitionInstanceId"?: string | undefined; "ancestorActivityInstanceId"?: string | undefined }> };
      output: Record<string, unknown>;
    };
    "camunda7_query_historic_activity_instances": {
      input: { "processInstanceId"?: string | undefined; "activityType"?: string | undefined; "finished"?: boolean | undefined; "unfinished"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "activityInstanceId" | "instanceId" | "executionId" | "activityId" | "activityName" | "activityType" | "startTime" | "endTime" | "duration" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_query_historic_process_instances": {
      input: { "processDefinitionKey"?: string | undefined; "finished"?: boolean | undefined; "unfinished"?: boolean | undefined; "startedBefore"?: string | undefined; "startedAfter"?: string | undefined; "maxResults": number | undefined; "sortBy"?: "instanceId" | "definitionId" | "definitionKey" | "definitionName" | "startTime" | "endTime" | "duration" | "tenantId" | "businessKey" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_query_historic_task_instances": {
      input: { "processInstanceId"?: string | undefined; "processDefinitionKey"?: string | undefined; "taskAssignee"?: string | undefined; "finished"?: boolean | undefined; "unfinished"?: boolean | undefined; "maxResults": number | undefined; "sortBy"?: "taskId" | "activityInstanceId" | "processDefinitionId" | "processInstanceId" | "executionId" | "duration" | "endTime" | "startTime" | "taskName" | "taskDescription" | "assignee" | "owner" | "dueDate" | "followUpDate" | "deleteReason" | "taskDefinitionKey" | "priority" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_query_historic_variable_instances": {
      input: { "processInstanceId"?: string | undefined; "variableName"?: string | undefined; "variableNameLike"?: string | undefined; "maxResults": number | undefined; "sortBy"?: "instanceId" | "variableName" | "tenantId" | undefined; "sortOrder"?: "asc" | "desc" | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_resolve_incident": {
      input: { "incidentId": string };
      output: Record<string, unknown>;
    };
    "camunda7_set_job_retries": {
      input: { "jobId": string; "retries": number };
      output: Record<string, unknown>;
    };
    "camunda7_set_process_instance_variable": {
      input: { "processInstanceId": string; "variableName": string; "value": unknown; "type"?: string | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_set_task_assignee": {
      input: { "taskId": string; "userId": string };
      output: Record<string, unknown>;
    };
    "camunda7_show_history_timeline": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_show_incident_panel": {
      input: { "processDefinitionKey"?: string | undefined; "incidentType"?: string | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_show_instance_detail": {
      input: { "processInstanceId": string };
      output: Record<string, unknown>;
    };
    "camunda7_show_process_list": {
      input: { "key"?: string | undefined; "nameLike"?: string | undefined; "latestVersion": boolean | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_show_task_dashboard": {
      input: { "assignee"?: string | undefined; "candidateGroup"?: string | undefined; "processDefinitionKey"?: string | undefined; "maxResults": number | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_start_process_instance": {
      input: { "processDefinitionKey": string; "businessKey"?: string | undefined; "variables"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_throw_signal": {
      input: { "name": string; "variables"?: Record<string, { "value": unknown; "type"?: string | undefined }> | undefined };
      output: Record<string, unknown>;
    };
    "camunda7_unclaim_task": {
      input: { "taskId": string };
      output: Record<string, unknown>;
    };
    "get-framework-manifest": {
      input: null;
      output: Record<string, unknown>;
    };
    "refresh-view": {
      input: { "keys"?: Record<string, unknown> | undefined; "steps"?: Array<{ "id": string; "step": string; "optional"?: boolean | undefined }> | undefined; "layout": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> | { "rows": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> } | { "tabs": Array<{ "label": string; "rows": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> }> }; "title"?: string | undefined };
      output: Record<string, unknown>;
    };
    "render-view": {
      input: { "keys"?: Record<string, unknown> | undefined; "steps"?: Array<{ "id": string; "step": string; "optional"?: boolean | undefined }> | undefined; "layout": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> | { "rows": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> } | { "tabs": Array<{ "label": string; "rows": Array<{ "row": Array<{ "widget": string; "span"?: number | undefined }> }> }> }; "title"?: string | undefined };
      output: Record<string, unknown>;
    };
  }
}

export {};
