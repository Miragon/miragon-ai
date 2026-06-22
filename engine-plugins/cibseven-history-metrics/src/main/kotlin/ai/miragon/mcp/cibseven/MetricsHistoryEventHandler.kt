package ai.miragon.mcp.cibseven

import io.opentelemetry.api.common.Attributes
import org.cibseven.bpm.engine.impl.history.event.HistoricActivityInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricIncidentEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricProcessInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricTaskInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoryEvent
import org.cibseven.bpm.engine.impl.history.handler.HistoryEventHandler

/**
 * Translates the engine's history-event stream into OTEL metrics ([ProcessMetrics]).
 *
 * Implements the engine's `HistoryEventHandler` SPI, but instead of persisting
 * events it records aggregated OTEL metrics — so no event store is needed.
 * History events fire for every instance and are not sampled, so counters and
 * histograms see 100 % of traffic.
 *
 * Durations come straight from the engine-computed `durationInMillis` on the
 * end/complete events; only model-bounded attributes are attached (see the
 * cardinality contract on [ProcessMetrics]).
 *
 * Backdated/replayed events are skipped: bulk seeding pins the engine clock into
 * the past, and those (often day-long) durations would otherwise pollute every
 * rate/duration window. Metrics represent live operation; the resulting
 * instances still show up in the state gauges, which query the engine directly.
 */
class MetricsHistoryEventHandler(private val engineId: String) : HistoryEventHandler {

    override fun handleEvent(historyEvent: HistoryEvent) {
        if (isBackdated(historyEvent)) return
        when (historyEvent) {
            is HistoricProcessInstanceEventEntity -> onProcessInstance(historyEvent)
            is HistoricActivityInstanceEventEntity -> onActivityInstance(historyEvent)
            is HistoricTaskInstanceEventEntity -> onTaskInstance(historyEvent)
            is HistoricIncidentEventEntity -> onIncident(historyEvent)
            else -> Unit
        }
    }

    override fun handleEvents(historyEvents: List<HistoryEvent>) {
        historyEvents.forEach { handleEvent(it) }
    }

    private fun onProcessInstance(e: HistoricProcessInstanceEventEntity) {
        val attrs = Attributes.builder()
            .put("process_definition_key", e.processDefinitionKey.orEmpty())
            .put("process_definition_version", versionOf(e.processDefinitionId))
            .put("engine_id", engineId)
            .put("tenant_id", e.tenantId.orEmpty())
            .build()
        when (e.eventType) {
            EVENT_START -> ProcessMetrics.processStarted.add(1, attrs)
            EVENT_END -> {
                val ended = attrs.toBuilder().put("state", e.state.orEmpty()).build()
                ProcessMetrics.processEnded.add(1, ended)
                e.durationInMillis?.let { ProcessMetrics.processDuration.record(it / MILLIS_PER_SECOND, attrs) }
            }
        }
    }

    private fun onActivityInstance(e: HistoricActivityInstanceEventEntity) {
        // Only completed activities carry a duration and a stable count.
        if (e.eventType != EVENT_END) return
        val attrs = Attributes.builder()
            .put("process_definition_key", e.processDefinitionKey.orEmpty())
            .put("activity_id", e.activityId.orEmpty())
            .put("activity_type", e.activityType.orEmpty())
            .put("engine_id", engineId)
            .build()
        ProcessMetrics.activityEnded.add(1, attrs)
        e.durationInMillis?.let { ProcessMetrics.activityDuration.record(it / MILLIS_PER_SECOND, attrs) }
    }

    private fun onTaskInstance(e: HistoricTaskInstanceEventEntity) {
        val attrs = Attributes.builder()
            .put("process_definition_key", e.processDefinitionKey.orEmpty())
            .put("task_definition_key", e.taskDefinitionKey.orEmpty())
            .put("engine_id", engineId)
            .build()
        when (e.eventType) {
            EVENT_CREATE -> ProcessMetrics.taskCreated.add(1, attrs)
            EVENT_COMPLETE -> {
                ProcessMetrics.taskCompleted.add(1, attrs)
                e.durationInMillis?.let { ProcessMetrics.taskDuration.record(it / MILLIS_PER_SECOND, attrs) }
            }
        }
    }

    private fun onIncident(e: HistoricIncidentEventEntity) {
        val attrs = Attributes.builder()
            .put("process_definition_key", e.processDefinitionKey.orEmpty())
            .put("activity_id", e.activityId.orEmpty())
            .put("incident_type", e.incidentType.orEmpty())
            .put("engine_id", engineId)
            .build()
        when (e.eventType) {
            EVENT_CREATE -> ProcessMetrics.incidentCreated.add(1, attrs)
            EVENT_RESOLVE -> ProcessMetrics.incidentResolved.add(1, attrs)
        }
    }

    /**
     * Camunda's `processDefinitionId` is `key:version:uuid`; version is not a
     * separate field. The middle segment is the deployment version.
     */
    private fun versionOf(processDefinitionId: String?): String = processDefinitionId?.split(":")?.getOrNull(1).orEmpty()

    /**
     * True when the event's own timestamp is well in the past — i.e. a
     * backdated/replayed event (bulk seeding), not live traffic. Keyed off the
     * event timestamp rather than the ambient clock, because history events may
     * be handled at transaction-flush time (after the seed has reset the clock),
     * which would otherwise let backdated durations slip through.
     */
    private fun isBackdated(event: HistoryEvent): Boolean {
        val eventMillis = eventTimeMillis(event) ?: return false
        return System.currentTimeMillis() - eventMillis > BACKDATE_SKIP_MS
    }

    private fun eventTimeMillis(event: HistoryEvent): Long? = when (event) {
        is HistoricProcessInstanceEventEntity -> (event.endTime ?: event.startTime)?.time
        is HistoricActivityInstanceEventEntity -> (event.endTime ?: event.startTime)?.time
        is HistoricTaskInstanceEventEntity -> (event.endTime ?: event.startTime)?.time
        is HistoricIncidentEventEntity -> (event.endTime ?: event.createTime)?.time
        else -> null
    }

    private companion object {
        const val MILLIS_PER_SECOND = 1000.0

        /** Skip events the engine timestamps more than this far in the past (seeding/replay). */
        const val BACKDATE_SKIP_MS = 5 * 60 * 1000L

        // HistoryEventTypes.getEventName() values (see org.cibseven.bpm.engine.impl.history.event)
        const val EVENT_START = "start"
        const val EVENT_END = "end"
        const val EVENT_CREATE = "create"
        const val EVENT_COMPLETE = "complete"
        const val EVENT_RESOLVE = "resolve"
    }
}
