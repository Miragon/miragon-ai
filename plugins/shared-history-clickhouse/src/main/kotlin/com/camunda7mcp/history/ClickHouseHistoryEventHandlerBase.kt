package com.camunda7mcp.history

import io.opentelemetry.api.trace.StatusCode
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

abstract class ClickHouseHistoryEventHandlerBase(
    protected val client: ClickHouseClient,
    protected val properties: ClickHouseProperties,
) {
    private val logger = LoggerFactory.getLogger(ClickHouseHistoryEventHandlerBase::class.java)
    protected val buffer = ConcurrentLinkedQueue<HistoryEventData>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "clickhouse-history-flush").apply { isDaemon = true }
    }

    init {
        scheduler.scheduleAtFixedRate(
            { flush() },
            properties.flushIntervalSeconds,
            properties.flushIntervalSeconds,
            TimeUnit.SECONDS,
        )
    }

    data class HistoryEventData(
        val eventCategory: EventCategory,
        val data: Map<String, Any?>,
    )

    enum class EventCategory {
        PROCESS_INSTANCE,
        ACTIVITY_INSTANCE,
        TASK_INSTANCE,
        VARIABLE_UPDATE,
        INCIDENT,
    }

    protected fun bufferEvent(event: HistoryEventData) {
        buffer.add(event)
        HistoryTelemetry.eventsBuffered.add(1)
        if (buffer.size >= properties.batchSize) {
            flush()
        }
    }

    private fun flush() {
        val events = mutableListOf<HistoryEventData>()
        while (buffer.isNotEmpty()) {
            buffer.poll()?.let { events.add(it) }
        }
        if (events.isEmpty()) return

        val span = HistoryTelemetry.tracer.spanBuilder("history.flush")
            .setAttribute("buffer.size", events.size.toLong())
            .startSpan()
        val start = System.currentTimeMillis()

        try {
            span.makeCurrent().use {
                logger.debug("Flushing {} history events to ClickHouse", events.size)

                val grouped = events.groupBy { it.eventCategory }

                grouped[EventCategory.PROCESS_INSTANCE]?.let {
                    client.insertProcessInstances(it.map { e -> e.data })
                }
                grouped[EventCategory.ACTIVITY_INSTANCE]?.let {
                    client.insertActivityInstances(it.map { e -> e.data })
                }
                grouped[EventCategory.TASK_INSTANCE]?.let {
                    client.insertTaskInstances(it.map { e -> e.data })
                }
                grouped[EventCategory.VARIABLE_UPDATE]?.let {
                    client.insertVariableUpdates(it.map { e -> e.data })
                }
                grouped[EventCategory.INCIDENT]?.let {
                    client.insertIncidents(it.map { e -> e.data })
                }

                HistoryTelemetry.eventsInserted.add(events.size.toLong())
            }
            span.setStatus(StatusCode.OK)
        } catch (e: Exception) {
            span.setStatus(StatusCode.ERROR, e.message ?: "flush failed")
            span.recordException(e)
            HistoryTelemetry.insertErrors.add(1)
            logger.error("Failed to flush {} history events", events.size, e)
        } finally {
            HistoryTelemetry.flushDuration.record(
                (System.currentTimeMillis() - start).toDouble()
            )
            span.end()
        }
    }

    fun shutdown() {
        scheduler.shutdown()
        scheduler.awaitTermination(10, TimeUnit.SECONDS)
        flush()
    }
}
