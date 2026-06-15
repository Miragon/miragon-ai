package com.camunda7mcp.metrics.cibseven

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Kotlin side of the Kotlin<->TS metric contract. Verifies that the OTEL
 * instruments declared in [ProcessMetrics] / [EngineStateMetrics] (and the
 * label keys attached in [MetricsHistoryEventHandler] / [EngineStateMetrics])
 * stay in sync with `packages/client-analytics/metrics-contract.json` — the
 * single source of truth consumed by the TS queries, the Prometheus alert
 * rules and the Grafana dashboards. A rename on either side fails this test.
 *
 * The instrument names/labels are extracted from the plugin sources (the OTEL
 * no-op API exposes no instrument metadata at runtime), so the test needs the
 * repo checkout — which is exactly the contract-test scenario.
 */
class MetricsContractTest {

    private val mapper = ObjectMapper()

    private val repoRoot: Path = findRepoRoot()
    private val contractFile: Path = repoRoot.resolve(CONTRACT_PATH)
    private val sourceDir: Path =
        repoRoot.resolve("engine-plugins/cibseven-history-metrics/src/main/kotlin/com/camunda7mcp/metrics/cibseven")

    private val contract: List<JsonNode> by lazy {
        mapper.readTree(contractFile.toFile()).path("metrics").toList()
    }

    private fun source(name: String): String = Files.readString(sourceDir.resolve(name))

    @Test
    fun `every emitted instrument is declared in the contract and vice versa`() {
        val emitted = parseInstruments()
        val declared = contract.associateBy { it.path("otelName").asText() }

        assertEquals(
            declared.keys,
            emitted.keys,
            "Instrument names in ProcessMetrics/EngineStateMetrics must match metrics-contract.json",
        )

        for ((otelName, instrument) in emitted) {
            val metric = declared.getValue(otelName)
            assertEquals(metric.path("type").asText(), instrument.type, "type of $otelName")
            assertEquals(metric.path("unit").asText(), instrument.unit, "unit of $otelName")
        }
    }

    @Test
    fun `contract promName follows the collector's Prometheus normalisation`() {
        for (metric in contract) {
            val otelName = metric.path("otelName").asText()
            var expected = otelName.replace('.', '_')
            if (metric.path("unit").asText() == "s") expected += "_seconds"
            if (metric.path("type").asText() == "counter") expected += "_total"
            assertEquals(expected, metric.path("promName").asText(), "promName of $otelName")
        }
    }

    @Test
    fun `every attached label key is declared in the contract and vice versa`() {
        val attached = Regex("""\.put\("([^"]+)"""")
            .findAll(source("MetricsHistoryEventHandler.kt") + source("EngineStateMetrics.kt"))
            .map { it.groupValues[1] }
            .toSet()
        val declared = contract.flatMap { m -> m.path("labels").map { it.asText() } }.toSet()

        assertEquals(declared, attached, "Label keys attached to instruments must match metrics-contract.json")
    }

    @Test
    fun `usertask status values match the contract knownValues`() {
        val emitted = Regex("""statusAttrs\("([^"]+)"\)""")
            .findAll(source("EngineStateMetrics.kt"))
            .map { it.groupValues[1] }
            .toSet()
        val declared = contract
            .single { it.path("otelName").asText() == "camunda.usertasks.open" }
            .path("knownValues").path("status")
            .map { it.asText() }
            .toSet()

        assertEquals(declared, emitted, "status values of camunda.usertasks.open")
    }

    /** name -> (type, unit) for every meter builder call in the plugin sources. */
    private fun parseInstruments(): Map<String, Instrument> {
        val src = source("ProcessMetrics.kt") + source("EngineStateMetrics.kt")
        val builders = Regex("""(counterBuilder|histogramBuilder|gaugeBuilder)\("([^"]+)"\)""")
            .findAll(src)
            .toList()
        assertTrue(builders.isNotEmpty(), "no instrument builders found — did the source layout change?")

        return builders.associate { match ->
            val type = when (match.groupValues[1]) {
                "counterBuilder" -> "counter"
                "histogramBuilder" -> "histogram"
                else -> "gauge"
            }
            // The builder chain ends at .build() / .buildObserver(); setUnit lives in between.
            val chainEnd = src.indexOf(".build", startIndex = match.range.last).let {
                if (it == -1) src.length else it
            }
            val chain = src.substring(match.range.last, chainEnd)
            val unit = Regex("""setUnit\("([^"]+)"\)""").find(chain)?.groupValues?.get(1) ?: ""
            match.groupValues[2] to Instrument(type, unit)
        }
    }

    private data class Instrument(val type: String, val unit: String)

    private companion object {
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
