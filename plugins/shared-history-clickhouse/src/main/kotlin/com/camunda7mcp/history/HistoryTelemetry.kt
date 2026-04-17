package com.camunda7mcp.history

import io.opentelemetry.api.GlobalOpenTelemetry
import io.opentelemetry.api.metrics.DoubleHistogram
import io.opentelemetry.api.metrics.LongCounter
import io.opentelemetry.api.trace.Tracer

/**
 * Centralized OTEL instrumentation for the history plugin.
 *
 * Uses [GlobalOpenTelemetry] which is auto-configured by the OTEL Java Agent
 * when attached. Without the agent, all calls are no-ops.
 */
object HistoryTelemetry {
    val tracer: Tracer = GlobalOpenTelemetry.getTracer("history-plugin")

    private val meter = GlobalOpenTelemetry.getMeter("history-plugin")

    val flushDuration: DoubleHistogram = meter.histogramBuilder("history.flush.duration_ms")
        .setDescription("Duration of ClickHouse flush operations")
        .setUnit("ms")
        .build()

    val eventsBuffered: LongCounter = meter.counterBuilder("history.events.buffered_total")
        .setDescription("Total events buffered for ClickHouse")
        .build()

    val eventsInserted: LongCounter = meter.counterBuilder("history.events.inserted_total")
        .setDescription("Total events inserted into ClickHouse")
        .build()

    val insertErrors: LongCounter = meter.counterBuilder("history.insert.errors_total")
        .setDescription("Total ClickHouse insert errors")
        .build()
}
