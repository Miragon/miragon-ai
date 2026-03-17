package com.camunda7mcp.otel.cibseven

import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import org.cibseven.bpm.spring.boot.starter.event.ExecutionEvent
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

@Component
class ExecutionEventListener {

    private val log = LoggerFactory.getLogger(javaClass)

    @EventListener
    fun onExecutionEvent(event: ExecutionEvent) {
        val eventName = event.eventName ?: return
        val activityId = event.currentActivityId ?: "unknown"
        val activityName = event.currentActivityName ?: activityId
        val processDefinitionId = event.processDefinitionId ?: "unknown"
        val processInstanceId = event.processInstanceId ?: "unknown"
        val executionId = event.id ?: ""
        val tenantId = event.tenantId ?: ""
        val businessKey = event.businessKey ?: ""

        val spanName = "execution.$eventName $activityName"

        val span = OtelEventBridgeTelemetry.tracer.spanBuilder(spanName)
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("camunda.event.type", "execution")
            .setAttribute("camunda.event.name", eventName)
            .setAttribute("camunda.process.definition.id", processDefinitionId)
            .setAttribute("camunda.process.instance.id", processInstanceId)
            .setAttribute("camunda.activity.id", activityId)
            .setAttribute("camunda.activity.name", activityName)
            .setAttribute("camunda.execution.id", executionId)
            .setAttribute("camunda.tenant.id", tenantId)
            .setAttribute("camunda.business.key", businessKey)
            .startSpan()

        span.makeCurrent().use {
            try {
                MDC.put("camunda.process.instance.id", processInstanceId)
                MDC.put("camunda.execution.id", executionId)
                MDC.put("camunda.activity.id", activityId)
                MDC.put("camunda.activity.name", activityName)
                MDC.put("camunda.event.name", eventName)
                MDC.put("camunda.process.definition.id", processDefinitionId)
                MDC.put("camunda.tenant.id", tenantId)
                MDC.put("camunda.business.key", businessKey)

                log.debug(
                    "Traced execution event: {} on activity {} ({}), process instance {}",
                    eventName, activityId, activityName, processInstanceId
                )
            } catch (ex: Exception) {
                span.setStatus(StatusCode.ERROR, ex.message ?: "unknown error")
                span.recordException(ex)
                log.warn("Error processing execution event", ex)
            } finally {
                MDC.remove("camunda.process.instance.id")
                MDC.remove("camunda.execution.id")
                MDC.remove("camunda.activity.id")
                MDC.remove("camunda.activity.name")
                MDC.remove("camunda.event.name")
                MDC.remove("camunda.process.definition.id")
                MDC.remove("camunda.tenant.id")
                MDC.remove("camunda.business.key")
                span.end()
            }
        }
    }
}
