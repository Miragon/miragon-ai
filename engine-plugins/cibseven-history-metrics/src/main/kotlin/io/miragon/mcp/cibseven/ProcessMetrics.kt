package io.miragon.mcp.cibseven

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.DistributionSummary
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Tags

/**
 * Micrometer meters for process analytics, emitted straight from the engine's
 * history-event stream (100 % coverage, never sampled). Records into the given
 * [MeterRegistry] — the plugin passes Micrometer's global composite registry,
 * so any export path the host application configures (Spring Boot Actuator
 * scrape or OTLP push, the OTEL Java agent's Micrometer bridge) receives the
 * meters. Without any export registry every recording is a no-op, so the
 * plugin is safe to load unconditionally.
 *
 * ## Resulting Prometheus names
 * Both export paths converge on the same Prometheus series: the OTEL
 * Collector's Prometheus exporter and Micrometer's own Prometheus registry
 * lowercase, replace `.` with `_`, append the unit and `_total` to monotonic
 * counters. So `camunda.process.instance.duration` (base unit `seconds`)
 * surfaces as `camunda_process_instance_duration_seconds{_bucket,_sum,_count}`
 * and `camunda.process.instance.started` as
 * `camunda_process_instance_started_total`. The base unit is deliberately the
 * spelled-out `seconds` (not UCUM `s`) because both exporters append it
 * verbatim; durations are recorded as plain seconds (a [DistributionSummary],
 * not a Micrometer `Timer`, whose base time unit would vary per registry).
 *
 * ## Cardinality contract
 * Only model-bounded tags are attached (definition key/version, activity
 * id/type, task key, incident type, engine id, tenant, instance state). NEVER
 * attach instance ids, business keys, variable values or raw incident messages —
 * they explode the time-series count. See [MetricsHistoryEventHandler].
 */
class ProcessMetrics(private val registry: MeterRegistry) {

    // --- Process instance ---
    fun processStarted(tags: Tags) = counter("camunda.process.instance.started", "Process instances started", tags)

    fun processEnded(tags: Tags) = counter("camunda.process.instance.ended", "Process instances ended, by terminal state", tags)

    fun processDuration(seconds: Double, tags: Tags) =
        durationSummary("camunda.process.instance.duration", "End-to-end process instance duration", DURATION_BUCKETS_SECONDS, tags)
            .record(seconds)

    // --- Activity instance (heatmap + bottleneck) ---
    fun activityEnded(tags: Tags) = counter("camunda.activity.ended", "Activity instances completed", tags)

    fun activityDuration(seconds: Double, tags: Tags) =
        durationSummary("camunda.activity.duration", "Activity instance execution time", DURATION_BUCKETS_SECONDS, tags)
            .record(seconds)

    // --- User task ---
    fun taskCreated(tags: Tags) = counter("camunda.usertask.created", "User tasks created", tags)

    fun taskCompleted(tags: Tags) = counter("camunda.usertask.completed", "User tasks completed", tags)

    fun taskDuration(seconds: Double, tags: Tags) =
        durationSummary("camunda.usertask.duration", "User task cycle time", TASK_BUCKETS_SECONDS, tags)
            .record(seconds)

    // --- Incident (failure analysis) ---
    fun incidentCreated(tags: Tags) = counter("camunda.incident.created", "Incidents created", tags)

    fun incidentResolved(tags: Tags) = counter("camunda.incident.resolved", "Incidents resolved", tags)

    // `register` is idempotent — it returns the existing meter for a known
    // (name, tags) pair, so the per-event lookup is a cheap map hit.
    private fun counter(name: String, description: String, tags: Tags) = Counter.builder(name)
        .description(description)
        .tags(tags)
        .register(registry)
        .increment()

    private fun durationSummary(name: String, description: String, buckets: DoubleArray, tags: Tags): DistributionSummary =
        DistributionSummary.builder(name)
            .description(description)
            .baseUnit("seconds")
            // SLOs materialise as explicit histogram buckets on every export
            // path (Micrometer's OTLP registry never falls back to an
            // exponential histogram when SLOs are set).
            .serviceLevelObjectives(*buckets)
            .tags(tags)
            .register(registry)

    private companion object {
        /** Process/activity durations: sub-second activities up to multi-hour processes. */
        val DURATION_BUCKETS_SECONDS =
            doubleArrayOf(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0, 1800.0, 3600.0)

        /** Human task cycle times: minutes to weeks. */
        val TASK_BUCKETS_SECONDS =
            doubleArrayOf(60.0, 300.0, 900.0, 1800.0, 3600.0, 14400.0, 43200.0, 86400.0, 259200.0, 604800.0)
    }
}
