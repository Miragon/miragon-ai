package com.camunda7mcp.otel.cibseven

import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import org.cibseven.bpm.spring.boot.starter.event.TaskEvent
import org.slf4j.LoggerFactory
import org.slf4j.MDC
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
        val taskId = event.id ?: ""
        val assignee = event.assignee ?: ""
        val owner = event.owner ?: ""
        val executionId = event.executionId ?: ""
        val tenantId = event.tenantId ?: ""

        val spanName = "task.$eventName $taskName"

        val span = OtelEventBridgeTelemetry.tracer.spanBuilder(spanName)
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("camunda.event.type", "task")
            .setAttribute("camunda.event.name", eventName)
            .setAttribute("camunda.process.definition.id", processDefinitionId)
            .setAttribute("camunda.process.instance.id", processInstanceId)
            .setAttribute("camunda.task.id", taskId)
            .setAttribute("camunda.task.name", taskName)
            .setAttribute("camunda.task.definition.key", taskDefinitionKey)
            .setAttribute("camunda.task.assignee", assignee)
            .setAttribute("camunda.task.owner", owner)
            .setAttribute("camunda.task.priority", event.priority.toLong())
            .setAttribute("camunda.execution.id", executionId)
            .setAttribute("camunda.tenant.id", tenantId)
            .startSpan()

        span.makeCurrent().use {
            try {
                MDC.put("camunda.process.instance.id", processInstanceId)
                MDC.put("camunda.process.definition.id", processDefinitionId)
                MDC.put("camunda.execution.id", executionId)
                MDC.put("camunda.event.name", eventName)
                MDC.put("camunda.task.id", taskId)
                MDC.put("camunda.task.name", taskName)
                MDC.put("camunda.task.definition.key", taskDefinitionKey)
                MDC.put("camunda.task.assignee", assignee)
                MDC.put("camunda.tenant.id", tenantId)

                log.debug(
                    "Traced task event: {} on task {} ({}), assignee {}, process instance {}",
                    eventName,
                    taskDefinitionKey,
                    taskName,
                    assignee,
                    processInstanceId,
                )
            } catch (ex: Exception) {
                span.setStatus(StatusCode.ERROR, ex.message ?: "unknown error")
                span.recordException(ex)
                log.warn("Error processing task event", ex)
            } finally {
                MDC.remove("camunda.process.instance.id")
                MDC.remove("camunda.process.definition.id")
                MDC.remove("camunda.execution.id")
                MDC.remove("camunda.event.name")
                MDC.remove("camunda.task.id")
                MDC.remove("camunda.task.name")
                MDC.remove("camunda.task.definition.key")
                MDC.remove("camunda.task.assignee")
                MDC.remove("camunda.tenant.id")
                span.end()
            }
        }
    }
}
