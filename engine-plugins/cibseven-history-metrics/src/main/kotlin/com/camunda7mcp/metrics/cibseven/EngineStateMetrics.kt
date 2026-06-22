package com.camunda7mcp.metrics.cibseven

import io.opentelemetry.api.GlobalOpenTelemetry
import io.opentelemetry.api.common.Attributes
import org.cibseven.bpm.engine.ProcessEngine
import org.slf4j.LoggerFactory
import java.util.Date

/**
 * Point-in-time engine-state gauges, complementing the event-driven counters in
 * [ProcessMetrics]. These answer "what is the state right now" — running WIP,
 * open incidents, job backlog, task backlog — which flow counters cannot derive
 * (a long-running instance shows in no `increase[period]`, but it is live WIP).
 *
 * Implemented as OTEL **observable** gauges: the callbacks fire on every metric
 * export (the OTEL agent's interval, 15 s here) and query the engine services.
 * [io.opentelemetry.api.metrics.Meter.batchCallback] lets one engine query feed
 * several instruments, so the per-definition statistics query runs once per tick.
 *
 * Cost note: each tick issues a handful of engine queries — fine for typical
 * deployments; widen the export interval if the definition count is very large.
 */
class EngineStateMetrics(private val engine: ProcessEngine, private val engineId: String) : AutoCloseable {

    private val log = LoggerFactory.getLogger(javaClass)
    private val meter = GlobalOpenTelemetry.getMeter("cibseven-engine-state")
    private val callbacks = mutableListOf<AutoCloseable>()
    private val engineAttrs: Attributes = Attributes.builder().put("engine_id", engineId).build()

    fun register() {
        registerDefinitionStats()
        registerJobGauges()
        registerTaskGauges()
        registerDeployedDefinitions()
        registerExternalTasks()
    }

    /** Running instances + dead (retries-exhausted) jobs + open incidents — one query, aggregated per key. */
    private fun registerDefinitionStats() {
        val running = meter.gaugeBuilder("camunda.process.instances.running")
            .setDescription("Currently running (active) process instances")
            .ofLongs().buildObserver()
        val failedJobs = meter.gaugeBuilder("camunda.jobs.failed")
            .setDescription("Jobs with no retries left (dead), by process definition")
            .ofLongs().buildObserver()
        val openIncidents = meter.gaugeBuilder("camunda.incidents.open")
            .setDescription("Open incidents, by process definition and type")
            .ofLongs().buildObserver()

        callbacks += meter.batchCallback(
            Runnable {
                try {
                    val runningByKey = HashMap<String, Long>()
                    val failedByKey = HashMap<String, Long>()
                    val incidentByKeyType = HashMap<Pair<String, String>, Long>()
                    val stats = engine.managementService
                        .createProcessDefinitionStatisticsQuery()
                        .includeFailedJobs()
                        .includeIncidents()
                        .list()
                    for (s in stats) {
                        val key = s.key ?: ""
                        runningByKey.merge(key, s.instances.toLong(), Long::plus)
                        failedByKey.merge(key, s.failedJobs.toLong(), Long::plus)
                        for (inc in s.incidentStatistics) {
                            incidentByKeyType.merge(key to (inc.incidentType ?: ""), inc.incidentCount.toLong(), Long::plus)
                        }
                    }
                    runningByKey.forEach { (k, v) -> running.record(v, keyAttrs(k)) }
                    failedByKey.forEach { (k, v) -> failedJobs.record(v, keyAttrs(k)) }
                    incidentByKeyType.forEach { (kt, v) ->
                        openIncidents.record(
                            v,
                            Attributes.builder()
                                .put("process_definition_key", kt.first)
                                .put("incident_type", kt.second)
                                .put("engine_id", engineId)
                                .build(),
                        )
                    }
                } catch (e: Exception) {
                    log.debug("definition-statistics gauges failed", e)
                }
            },
            running,
            failedJobs,
            openIncidents,
        )
    }

    /** Job-executor health: ready backlog, suspended, and future-due jobs. */
    private fun registerJobGauges() {
        val executable = meter.gaugeBuilder("camunda.jobs.executable")
            .setDescription("Jobs ready to execute now")
            .ofLongs().buildObserver()
        val suspended = meter.gaugeBuilder("camunda.jobs.suspended")
            .setDescription("Suspended jobs")
            .ofLongs().buildObserver()
        val dueFuture = meter.gaugeBuilder("camunda.jobs.due_future")
            .setDescription("Jobs with a due date in the future")
            .ofLongs().buildObserver()

        callbacks += meter.batchCallback(
            Runnable {
                try {
                    val mgmt = engine.managementService
                    executable.record(mgmt.createJobQuery().executable().count(), engineAttrs)
                    suspended.record(mgmt.createJobQuery().suspended().count(), engineAttrs)
                    dueFuture.record(mgmt.createJobQuery().duedateHigherThan(Date()).count(), engineAttrs)
                } catch (e: Exception) {
                    log.debug("job gauges failed", e)
                }
            },
            executable,
            suspended,
            dueFuture,
        )
    }

    /** User-task backlog by status. `assigned` is derived (total − unassigned). */
    private fun registerTaskGauges() {
        val openTasks = meter.gaugeBuilder("camunda.usertasks.open")
            .setDescription("Open user tasks, by status")
            .ofLongs().buildObserver()

        callbacks += meter.batchCallback(
            Runnable {
                try {
                    val ts = engine.taskService
                    val total = ts.createTaskQuery().count()
                    val unassigned = ts.createTaskQuery().taskUnassigned().count()
                    openTasks.record(total, statusAttrs("total"))
                    openTasks.record(unassigned, statusAttrs("unassigned"))
                    openTasks.record((total - unassigned).coerceAtLeast(0), statusAttrs("assigned"))
                } catch (e: Exception) {
                    log.debug("task gauges failed", e)
                }
            },
            openTasks,
        )
    }

    /** Deployed process-definition versions per key (inventory). */
    private fun registerDeployedDefinitions() {
        val deployed = meter.gaugeBuilder("camunda.process.definitions.deployed")
            .setDescription("Deployed process definition versions, by key")
            .ofLongs().buildObserver()

        callbacks += meter.batchCallback(
            Runnable {
                try {
                    engine.repositoryService.createProcessDefinitionQuery().list()
                        .groupingBy { it.key ?: "" }
                        .eachCount()
                        .forEach { (key, count) -> deployed.record(count.toLong(), keyAttrs(key)) }
                } catch (e: Exception) {
                    log.debug("deployed-definitions gauge failed", e)
                }
            },
            deployed,
        )
    }

    /** Open external tasks (worker pattern). Total only — topic has no group-by query. */
    private fun registerExternalTasks() {
        val open = meter.gaugeBuilder("camunda.external_tasks.open")
            .setDescription("Open external tasks awaiting a worker")
            .ofLongs().buildObserver()

        callbacks += meter.batchCallback(
            Runnable {
                try {
                    open.record(engine.externalTaskService.createExternalTaskQuery().count(), engineAttrs)
                } catch (e: Exception) {
                    log.debug("external-task gauge failed", e)
                }
            },
            open,
        )
    }

    private fun keyAttrs(key: String): Attributes =
        Attributes.builder().put("process_definition_key", key).put("engine_id", engineId).build()

    private fun statusAttrs(status: String): Attributes = Attributes.builder().put("status", status).put("engine_id", engineId).build()

    override fun close() {
        callbacks.forEach { runCatching { it.close() } }
        callbacks.clear()
    }
}
