package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase.EventCategory
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase.HistoryEventData
import org.cibseven.bpm.engine.impl.history.event.*

class CibSevenEventMapper {

    fun map(event: HistoryEvent): HistoryEventData? = when (event) {
        is HistoricProcessInstanceEventEntity -> HistoryEventData(
            eventCategory = EventCategory.PROCESS_INSTANCE,
            data = mapOf(
                "id" to event.processInstanceId,
                "process_definition_id" to event.processDefinitionId,
                "process_definition_key" to event.processDefinitionKey,
                "process_definition_name" to event.processDefinitionName,
                "business_key" to event.businessKey,
                "start_time" to event.startTime,
                "end_time" to event.endTime,
                "duration_in_millis" to event.durationInMillis,
                "start_user_id" to event.startUserId,
                "start_activity_id" to event.startActivityId,
                "end_activity_id" to event.endActivityId,
                "delete_reason" to event.deleteReason,
                "super_process_instance_id" to event.superProcessInstanceId,
                "state" to event.state,
                "tenant_id" to event.tenantId,
                "engine_type" to "cibseven",
                "event_type" to event.eventType,
            ),
        )
        is HistoricActivityInstanceEventEntity -> HistoryEventData(
            eventCategory = EventCategory.ACTIVITY_INSTANCE,
            data = mapOf(
                "id" to event.activityInstanceId,
                "parent_activity_instance_id" to event.parentActivityInstanceId,
                "activity_id" to event.activityId,
                "activity_name" to event.activityName,
                "activity_type" to event.activityType,
                "process_definition_id" to event.processDefinitionId,
                "process_definition_key" to event.processDefinitionKey,
                "process_instance_id" to event.processInstanceId,
                "execution_id" to event.executionId,
                "start_time" to event.startTime,
                "end_time" to event.endTime,
                "duration_in_millis" to event.durationInMillis,
                "assignee" to event.assignee,
                "task_id" to event.taskId,
                "tenant_id" to event.tenantId,
                "engine_type" to "cibseven",
                "event_type" to event.eventType,
            ),
        )
        is HistoricTaskInstanceEventEntity -> HistoryEventData(
            eventCategory = EventCategory.TASK_INSTANCE,
            data = mapOf(
                "id" to event.id,
                "task_id" to event.taskId,
                "process_definition_id" to event.processDefinitionId,
                "process_definition_key" to event.processDefinitionKey,
                "process_instance_id" to event.processInstanceId,
                "execution_id" to event.executionId,
                "activity_instance_id" to event.activityInstanceId,
                "name" to event.name,
                "description" to event.description,
                "assignee" to event.assignee,
                "owner" to event.owner,
                "priority" to event.priority,
                "due_date" to event.dueDate,
                "follow_up_date" to event.followUpDate,
                "start_time" to event.startTime,
                "end_time" to event.endTime,
                "duration_in_millis" to event.durationInMillis,
                "delete_reason" to event.deleteReason,
                "tenant_id" to event.tenantId,
                "engine_type" to "cibseven",
                "event_type" to event.eventType,
            ),
        )
        is HistoricVariableUpdateEventEntity -> HistoryEventData(
            eventCategory = EventCategory.VARIABLE_UPDATE,
            data = mapOf(
                "id" to event.variableInstanceId,
                "process_definition_id" to event.processDefinitionId,
                "process_definition_key" to event.processDefinitionKey,
                "process_instance_id" to event.processInstanceId,
                "execution_id" to event.executionId,
                "activity_instance_id" to event.activityInstanceId,
                "task_id" to event.taskId,
                "variable_name" to event.variableName,
                "variable_type" to event.serializerName,
                "serialized_value" to event.textValue2,
                "text_value" to event.textValue,
                "long_value" to event.longValue,
                "double_value" to event.doubleValue,
                "revision" to event.revision,
                "tenant_id" to event.tenantId,
                "engine_type" to "cibseven",
                "event_type" to event.eventType,
            ),
        )
        is HistoricIncidentEventEntity -> HistoryEventData(
            eventCategory = EventCategory.INCIDENT,
            data = mapOf(
                "id" to event.id,
                "process_definition_id" to event.processDefinitionId,
                "process_definition_key" to event.processDefinitionKey,
                "process_instance_id" to event.processInstanceId,
                "execution_id" to event.executionId,
                "activity_id" to event.activityId,
                "incident_type" to event.incidentType,
                "incident_message" to event.incidentMessage,
                "cause_incident_id" to event.causeIncidentId,
                "root_cause_incident_id" to event.rootCauseIncidentId,
                "configuration" to event.configuration,
                "create_time" to event.createTime,
                "end_time" to event.endTime,
                "state" to if (event.endTime != null) "resolved" else "open",
                "tenant_id" to event.tenantId,
                "engine_type" to "cibseven",
                "event_type" to event.eventType,
            ),
        )
        else -> null
    }
}
