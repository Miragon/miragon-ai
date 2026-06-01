package com.camunda7mcp.metrics.cibseven

import io.opentelemetry.api.GlobalOpenTelemetry
import io.opentelemetry.api.metrics.DoubleHistogram
import io.opentelemetry.api.metrics.LongCounter

/**
 * OTEL instruments for process analytics, emitted straight from the engine's
 * history-event stream (100 % coverage, never sampled). The OTEL Collector is
 * the sole export path — these become Prometheus series.
 *
 * Uses [GlobalOpenTelemetry], which the OTEL Java agent populates at startup.
 * Without the agent every instrument is a no-op, so the plugin is safe to load
 * unconditionally. Initialized lazily on the first history event — long after
 * the agent has installed the global provider.
 *
 * ## Resulting Prometheus names
 * The Collector's Prometheus exporter lowercases, replaces `.` with `_`, appends
 * the unit (`s` → `_seconds`) and `_total` to monotonic counters. So
 * `camunda.process.instance.duration` (unit `s`) surfaces as
 * `camunda_process_instance_duration_seconds{_bucket,_sum,_count}` and
 * `camunda.process.instance.started` as `camunda_process_instance_started_total`.
 *
 * ## Cardinality contract
 * Only model-bounded attributes are attached (definition key/version, activity
 * id/type, task key, incident type, engine id, tenant, instance state). NEVER
 * attach instance ids, business keys, variable values or raw incident messages —
 * they explode the time-series count. See [MetricsHistoryEventHandler].
 */
object ProcessMetrics {
    private val meter = GlobalOpenTelemetry.getMeter("cibseven-process-metrics")

    /** Process/activity durations: sub-second activities up to multi-hour processes. */
    private val DURATION_BUCKETS_SECONDS =
        listOf(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0, 1800.0, 3600.0)

    /** Human task cycle times: minutes to weeks. */
    private val TASK_BUCKETS_SECONDS =
        listOf(60.0, 300.0, 900.0, 1800.0, 3600.0, 14400.0, 43200.0, 86400.0, 259200.0, 604800.0)

    // --- Process instance ---
    val processStarted: LongCounter = meter.counterBuilder("camunda.process.instance.started")
        .setDescription("Process instances started")
        .build()

    val processEnded: LongCounter = meter.counterBuilder("camunda.process.instance.ended")
        .setDescription("Process instances ended, by terminal state")
        .build()

    val processDuration: DoubleHistogram = meter.histogramBuilder("camunda.process.instance.duration")
        .setDescription("End-to-end process instance duration")
        .setUnit("s")
        .setExplicitBucketBoundariesAdvice(DURATION_BUCKETS_SECONDS)
        .build()

    // --- Activity instance (heatmap + bottleneck) ---
    val activityEnded: LongCounter = meter.counterBuilder("camunda.activity.ended")
        .setDescription("Activity instances completed")
        .build()

    val activityDuration: DoubleHistogram = meter.histogramBuilder("camunda.activity.duration")
        .setDescription("Activity instance execution time")
        .setUnit("s")
        .setExplicitBucketBoundariesAdvice(DURATION_BUCKETS_SECONDS)
        .build()

    // --- User task ---
    val taskCreated: LongCounter = meter.counterBuilder("camunda.usertask.created")
        .setDescription("User tasks created")
        .build()

    val taskCompleted: LongCounter = meter.counterBuilder("camunda.usertask.completed")
        .setDescription("User tasks completed")
        .build()

    val taskDuration: DoubleHistogram = meter.histogramBuilder("camunda.usertask.duration")
        .setDescription("User task cycle time")
        .setUnit("s")
        .setExplicitBucketBoundariesAdvice(TASK_BUCKETS_SECONDS)
        .build()

    // --- Incident (failure analysis) ---
    val incidentCreated: LongCounter = meter.counterBuilder("camunda.incident.created")
        .setDescription("Incidents created")
        .build()

    val incidentResolved: LongCounter = meter.counterBuilder("camunda.incident.resolved")
        .setDescription("Incidents resolved")
        .build()
}
