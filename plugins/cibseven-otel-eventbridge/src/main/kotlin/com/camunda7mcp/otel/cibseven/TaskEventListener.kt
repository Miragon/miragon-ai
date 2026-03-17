package com.camunda7mcp.otel.cibseven

import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import org.cibseven.bpm.spring.boot.starter.event.TaskEvent
import org.slf4j.LoggerFactory
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

@Component
class TaskEventListener {

    private val log = LoggerFactory.getLogger(javaClass)

    @EventListener
    fun onTaskEvent(event: TaskEvent) {
        val eventName = event.eventName ?: return
        val taskName = event.name ?: "unknown"
        val taskDefinitionKey = event.taskDefinitionKey ?: "unknown"
        val processInstanceId = event.processInstanceId ?: "unknown"
        val processDefinitionId = event.processDefinitionId ?: "unknown"

        val spanName = "task.$eventName $taskName"

        val span = OtelEventBridgeTelemetry.tracer.spanBuilder(spanName)
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("camunda.event.type", "task")
            .setAttribute("camunda.event.name", eventName)
            .setAttribute("camunda.process.definition.id", processDefinitionId)
            .setAttribute("camunda.process.instance.id", processInstanceId)
            .setAttribute("camunda.task.id", event.id ?: "")
            .setAttribute("camunda.task.name", taskName)
            .setAttribute("camunda.task.definition.key", taskDefinitionKey)
            .setAttribute("camunda.task.assignee", event.assignee ?: "")
            .setAttribute("camunda.task.owner", event.owner ?: "")
            .setAttribute("camunda.task.priority", event.priority.toLong())
            .setAttribute("camunda.execution.id", event.executionId ?: "")
            .setAttribute("camunda.tenant.id", event.tenantId ?: "")
            .startSpan()

        try {
            log.debug(
                "Traced task event: {} on task {} ({}), assignee {}, process instance {}",
                eventName, taskDefinitionKey, taskName, event.assignee, processInstanceId
            )
        } catch (ex: Exception) {
            span.setStatus(StatusCode.ERROR, ex.message ?: "unknown error")
            span.recordException(ex)
            log.warn("Error processing task event", ex)
        } finally {
            span.end()
        }
    }
}
