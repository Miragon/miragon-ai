package io.miragon.mcp.cibseven

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import io.micrometer.core.instrument.Meter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.search.RequiredSearch
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.cibseven.bpm.engine.ProcessEngine
import org.cibseven.bpm.engine.impl.history.event.HistoricActivityInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricIncidentEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricProcessInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoricTaskInstanceEventEntity
import org.cibseven.bpm.engine.management.IncidentStatistics
import org.cibseven.bpm.engine.management.ProcessDefinitionStatistics
import org.cibseven.bpm.engine.repository.ProcessDefinition
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.RETURNS_DEEP_STUBS
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Kotlin side of the Kotlin<->TS metric contract. Verifies that the meters the
 * plugin actually emits ([ProcessMetrics] via [MetricsHistoryEventHandler],
 * [EngineStateMetrics]) stay in sync with
 * `packages/client-analytics/metrics-contract.json` — the single source of
 * truth consumed by the TS queries, the Prometheus alert rules and the Grafana
 * dashboards. A rename on either side fails this test.
 *
 * Unlike the OTEL no-op API, Micrometer exposes every registered meter with
 * its full metadata at runtime — so the test drives real history events and a
 * mocked engine into a [SimpleMeterRegistry] and compares actual emissions
 * (names, types, units, tag keys, tag values) against the contract, instead of
 * regex-scanning the plugin sources.
 */
class MetricsContractTest {

    private val mapper = ObjectMapper()

    private val contract: List<JsonNode> by lazy {
        mapper.readTree(findRepoRoot().resolve(CONTRACT_PATH).toFile()).path("metrics").toList()
    }

    /** Every meter the plugin emits, produced by exercising both emitters for real. */
    private val registry: MeterRegistry by lazy {
        SimpleMeterRegistry().also {
            emitHistoryMetrics(it)
            refreshStateGauges(it)
        }
    }

    /**
     * Emitted meters by name. SimpleMeterRegistry surfaces SLO buckets as a
     * synthetic `<name>.histogram` gauge per bucket (registries with a native
     * histogram type — Prometheus, OTLP — fold them into the summary itself),
     * so those are representation details, not contract-relevant meters.
     */
    private fun emittedMeters(): Map<String, List<Meter>> = registry.meters
        .filterNot { it.id.name.endsWith(".histogram") && it.id.getTag("le") != null }
        .groupBy { it.id.name }

    @Test
    fun `every emitted meter is declared in the contract and vice versa`() {
        val emitted = emittedMeters()
        val declared = contract.associateBy { it.path("otelName").asText() }

        assertEquals(
            declared.keys,
            emitted.keys,
            "Meters emitted by ProcessMetrics/EngineStateMetrics must match metrics-contract.json",
        )

        for ((name, meters) in emitted) {
            val metric = declared.getValue(name)
            // The contract declares the OTLP-style unit ("s"); Micrometer
            // carries the spelled-out base unit ("seconds") that both the
            // Collector and the Prometheus registry append verbatim.
            val expectedBaseUnit = when (val unit = metric.path("unit").asText()) {
                "" -> null
                "s" -> "seconds"
                else -> unit
            }
            for (meter in meters) {
                assertEquals(metric.path("type").asText(), typeOf(meter), "type of $name")
                assertEquals(expectedBaseUnit, meter.id.baseUnit, "base unit of $name")
            }
        }
    }

    @Test
    fun `every meter attaches exactly the label keys its contract entry declares`() {
        val emitted = emittedMeters()
        for (metric in contract) {
            val name = metric.path("otelName").asText()
            val declared = metric.path("labels").map { it.asText() }.toSet()
            val meters = emitted[name] ?: error("no meter emitted for $name")
            for (meter in meters) {
                assertEquals(declared, meter.id.tags.map { it.key }.toSet(), "label keys attached to $name")
            }
        }
    }

    @Test
    fun `contract promName follows the Prometheus normalisation`() {
        for (metric in contract) {
            val otelName = metric.path("otelName").asText()
            var expected = otelName.replace('.', '_')
            if (metric.path("unit").asText() == "s") expected += "_seconds"
            if (metric.path("type").asText() == "counter") expected += "_total"
            assertEquals(expected, metric.path("promName").asText(), "promName of $otelName")
        }
    }

    @Test
    fun `usertask status values match the contract knownValues`() {
        val emitted = registry.find("camunda.usertasks.open").gauges().map { it.id.getTag("status") }.toSet()
        val declared = contract
            .single { it.path("otelName").asText() == "camunda.usertasks.open" }
            .path("knownValues").path("status")
            .map { it.asText() }
            .toSet()

        assertEquals(declared, emitted, "status values of camunda.usertasks.open")
    }

    @Test
    fun `durations are recorded in seconds`() {
        val summary = RequiredSearch.`in`(registry).name("camunda.process.instance.duration").summary()
        assertEquals(1, summary.count(), "one process end event carried a duration")
        assertEquals(3.0, summary.totalAmount(), "3000 ms must be recorded as 3 s")
    }

    @Test
    fun `backdated events are skipped`() {
        val backdatedRegistry = SimpleMeterRegistry()
        MetricsHistoryEventHandler(ENGINE_ID, backdatedRegistry).handleEvent(
            HistoricProcessInstanceEventEntity().apply {
                eventType = "start"
                processDefinitionKey = "loan"
                processDefinitionId = "loan:3:uuid"
                startTime = Date(System.currentTimeMillis() - 10 * 60 * 1000)
            },
        )
        assertTrue(backdatedRegistry.meters.isEmpty(), "backdated (seeded/replayed) events must not be counted")
    }

    private fun typeOf(meter: Meter): String = when (meter.id.type) {
        Meter.Type.COUNTER -> "counter"
        Meter.Type.DISTRIBUTION_SUMMARY -> "histogram"
        Meter.Type.GAUGE -> "gauge"
        else -> error("unexpected meter type ${meter.id.type} for ${meter.id.name}")
    }

    /** One history event per emitting code path, timestamped now (not backdated). */
    private fun emitHistoryMetrics(registry: MeterRegistry) {
        val handler = MetricsHistoryEventHandler(ENGINE_ID, registry)
        val now = Date()

        handler.handleEvent(
            HistoricProcessInstanceEventEntity().apply {
                eventType = "start"
                processDefinitionKey = "loan"
                processDefinitionId = "loan:3:uuid"
                tenantId = "tenant-1"
                startTime = now
            },
        )
        handler.handleEvent(
            HistoricProcessInstanceEventEntity().apply {
                eventType = "end"
                processDefinitionKey = "loan"
                processDefinitionId = "loan:3:uuid"
                tenantId = "tenant-1"
                state = "COMPLETED"
                startTime = now
                endTime = now
                durationInMillis = 3000L
            },
        )
        handler.handleEvent(
            HistoricActivityInstanceEventEntity().apply {
                eventType = "end"
                processDefinitionKey = "loan"
                activityId = "Activity_Approve"
                activityType = "userTask"
                startTime = now
                endTime = now
                durationInMillis = 1500L
            },
        )
        handler.handleEvent(
            HistoricTaskInstanceEventEntity().apply {
                eventType = "create"
                processDefinitionKey = "loan"
                taskDefinitionKey = "Activity_Approve"
                startTime = now
            },
        )
        handler.handleEvent(
            HistoricTaskInstanceEventEntity().apply {
                eventType = "complete"
                processDefinitionKey = "loan"
                taskDefinitionKey = "Activity_Approve"
                startTime = now
                endTime = now
                durationInMillis = 60_000L
            },
        )
        handler.handleEvent(
            HistoricIncidentEventEntity().apply {
                eventType = "create"
                processDefinitionKey = "loan"
                activityId = "Activity_Approve"
                incidentType = "failedJob"
                createTime = now
            },
        )
        handler.handleEvent(
            HistoricIncidentEventEntity().apply {
                eventType = "resolve"
                processDefinitionKey = "loan"
                activityId = "Activity_Approve"
                incidentType = "failedJob"
                createTime = now
                endTime = now
            },
        )
    }

    /** One state tick against a mocked engine that yields at least one row per gauge. */
    private fun refreshStateGauges(registry: MeterRegistry) {
        val engine = mock(ProcessEngine::class.java, RETURNS_DEEP_STUBS)

        val incident = mock(IncidentStatistics::class.java)
        `when`(incident.incidentType).thenReturn("failedJob")
        `when`(incident.incidentCount).thenReturn(2)
        val stat = mock(ProcessDefinitionStatistics::class.java)
        `when`(stat.key).thenReturn("loan")
        `when`(stat.instances).thenReturn(4)
        `when`(stat.failedJobs).thenReturn(1)
        `when`(stat.incidentStatistics).thenReturn(listOf(incident))
        `when`(
            engine.managementService.createProcessDefinitionStatisticsQuery().includeFailedJobs().includeIncidents().list(),
        ).thenReturn(listOf(stat))

        `when`(engine.managementService.createJobQuery().executable().count()).thenReturn(3L)
        `when`(engine.managementService.createJobQuery().suspended().count()).thenReturn(1L)
        `when`(engine.managementService.createJobQuery().duedateHigherThan(any()).count()).thenReturn(2L)

        `when`(engine.taskService.createTaskQuery().count()).thenReturn(5L)
        `when`(engine.taskService.createTaskQuery().taskUnassigned().count()).thenReturn(2L)

        val definition = mock(ProcessDefinition::class.java)
        `when`(definition.key).thenReturn("loan")
        `when`(engine.repositoryService.createProcessDefinitionQuery().list()).thenReturn(listOf(definition))

        `when`(engine.externalTaskService.createExternalTaskQuery().count()).thenReturn(7L)

        EngineStateMetrics(engine, ENGINE_ID, registry).refresh()
    }

    private companion object {
        const val ENGINE_ID = "test-engine"
        const val CONTRACT_PATH = "packages/client-analytics/metrics-contract.json"

        /**
         * Walks up from the Gradle test working directory (the module dir, i.e.
         * `engine-plugins/cibseven-history-metrics`) until the contract file is
         * found, so the test is robust to where Gradle is invoked from.
         */
        fun findRepoRoot(): Path {
            var dir: Path? = Paths.get("").toAbsolutePath()
            while (dir != null) {
                if (Files.exists(dir.resolve(CONTRACT_PATH))) return dir
                dir = dir.parent
            }
            error("Repo root with $CONTRACT_PATH not found above ${Paths.get("").toAbsolutePath()}")
        }
    }
}
