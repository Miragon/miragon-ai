package com.camunda7mcp.otel.cibseven

import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import org.cibseven.bpm.spring.boot.starter.event.ExecutionEvent
import org.slf4j.LoggerFactory
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

        val spanName = "execution.$eventName $activityName"

        val span = OtelEventBridgeTelemetry.tracer.spanBuilder(spanName)
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("camunda.event.type", "execution")
            .setAttribute("camunda.event.name", eventName)
            .setAttribute("camunda.process.definition.id", processDefinitionId)
            .setAttribute("camunda.process.instance.id", processInstanceId)
            .setAttribute("camunda.activity.id", activityId)
            .setAttribute("camunda.activity.name", activityName)
            .setAttribute("camunda.execution.id", event.id ?: "")
            .setAttribute("camunda.tenant.id", event.tenantId ?: "")
            .setAttribute("camunda.business.key", event.businessKey ?: "")
            .startSpan()

        try {
            log.debug(
                "Traced execution event: {} on activity {} ({}), process instance {}",
                eventName, activityId, activityName, processInstanceId
            )
        } catch (ex: Exception) {
            span.setStatus(StatusCode.ERROR, ex.message ?: "unknown error")
            span.recordException(ex)
            log.warn("Error processing execution event", ex)
        } finally {
            span.end()
        }
    }
}
