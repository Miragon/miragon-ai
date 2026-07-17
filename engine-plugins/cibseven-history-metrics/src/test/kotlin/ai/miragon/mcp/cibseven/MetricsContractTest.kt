package ai.miragon.mcp.cibseven

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
        repoRoot.resolve("engine-plugins/cibseven-history-metrics/src/main/kotlin/ai/miragon/mcp/cibseven")

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
    fun `every instrument attaches exactly the label keys its contract entry declares`() {
        val attached = parseAttachedLabels()
        val declared = contract.associate { m ->
            m.path("otelName").asText() to m.path("labels").map { it.asText() }.toSet()
        }

        assertEquals(
            declared.keys,
            attached.keys,
            "Every contract metric must have label attribution in the plugin sources (and vice versa)",
        )
        for ((otelName, labels) in attached) {
            assertEquals(declared.getValue(otelName), labels, "label keys attached to $otelName")
        }
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

    /**
     * otelName -> label keys attached at the add()/record() call sites, resolved
     * per instrument by scanning the emitting sources (same source-scanning
     * approach as [parseInstruments]): [MetricsHistoryEventHandler] for the
     * history-event counters/histograms, [EngineStateMetrics] for the gauges.
     * A label attached to the wrong instrument fails the per-metric comparison.
     */
    private fun parseAttachedLabels(): Map<String, Set<String>> = historyHandlerLabels() + engineStateLabels()

    /** Label keys of every `.put("…", …)` call in a builder-chain snippet. */
    private fun putKeys(chain: String): Set<String> = Regex("""\.put\("([^"]+)"""").findAll(chain).map { it.groupValues[1] }.toSet()

    /**
     * [MetricsHistoryEventHandler]: each handler method builds local
     * `Attributes` values (optionally augmented via `toBuilder()`) and passes
     * one to a [ProcessMetrics] instrument. Scoped per method so the
     * identically named `attrs` variables don't bleed into each other.
     */
    private fun historyHandlerLabels(): Map<String, Set<String>> {
        val instrumentByField = Regex("""val\s+(\w+)\s*:\s*\w+\s*=\s*meter\.\w+Builder\("([^"]+)"\)""")
            .findAll(source("ProcessMetrics.kt"))
            .associate { it.groupValues[1] to it.groupValues[2] }
        assertTrue(instrumentByField.isNotEmpty(), "no instrument fields found in ProcessMetrics.kt")

        val result = mutableMapOf<String, MutableSet<String>>()
        for (method in source("MetricsHistoryEventHandler.kt").split(Regex("""(?=private fun )"""))) {
            val attrsVars = mutableMapOf<String, Set<String>>()
            Regex("""val\s+(\w+)\s*=\s*Attributes\.builder\(\)(.*?)\.build\(\)""", RegexOption.DOT_MATCHES_ALL)
                .findAll(method)
                .forEach { attrsVars[it.groupValues[1]] = putKeys(it.groupValues[2]) }
            Regex("""val\s+(\w+)\s*=\s*(\w+)\.toBuilder\(\)(.*?)\.build\(\)""", RegexOption.DOT_MATCHES_ALL)
                .findAll(method)
                .forEach { m ->
                    val base = attrsVars[m.groupValues[2]]
                        ?: error("toBuilder() base `${m.groupValues[2]}` not resolvable in MetricsHistoryEventHandler.kt")
                    attrsVars[m.groupValues[1]] = base + putKeys(m.groupValues[3])
                }
            // `ProcessMetrics.<field>.add(1, attrs)` / `.record(…, attrs)` — the
            // attributes argument is always a simple local variable.
            Regex("""ProcessMetrics\.(\w+)\.(?:add|record)\([^,]*,\s*(\w+)\)""")
                .findAll(method)
                .forEach { m ->
                    val otelName = instrumentByField[m.groupValues[1]]
                        ?: error("unknown ProcessMetrics field `${m.groupValues[1]}`")
                    val labels = attrsVars[m.groupValues[2]]
                        ?: error("attributes variable `${m.groupValues[2]}` not resolvable for $otelName")
                    result.getOrPut(otelName) { mutableSetOf() } += labels
                }
        }
        assertTrue(result.isNotEmpty(), "no instrument usages found in MetricsHistoryEventHandler.kt")
        return result
    }

    /**
     * [EngineStateMetrics]: every observer's `record(value, attrs)` call, with
     * the attributes resolved from the shared `engineAttrs` val, the
     * `keyAttrs`/`statusAttrs` helpers, or an inline `Attributes.builder()`
     * chain within the call.
     */
    private fun engineStateLabels(): Map<String, Set<String>> {
        val src = source("EngineStateMetrics.kt")
        val observers = Regex("""val\s+(\w+)\s*=\s*meter\.gaugeBuilder\("([^"]+)"\)""")
            .findAll(src)
            .associate { it.groupValues[1] to it.groupValues[2] }
        assertTrue(observers.isNotEmpty(), "no gauge observers found in EngineStateMetrics.kt")

        val namedAttrs = buildMap {
            Regex("""val\s+(\w+)\s*:\s*Attributes\s*=\s*Attributes\.builder\(\)(.*?)\.build\(\)""", RegexOption.DOT_MATCHES_ALL)
                .findAll(src)
                .forEach { put(it.groupValues[1], putKeys(it.groupValues[2])) }
            Regex("""fun\s+(\w+)\([^)]*\):\s*Attributes\s*=\s*Attributes\.builder\(\)(.*?)\.build\(\)""", RegexOption.DOT_MATCHES_ALL)
                .findAll(src)
                .forEach { put(it.groupValues[1], putKeys(it.groupValues[2])) }
        }

        val result = mutableMapOf<String, MutableSet<String>>()
        for (call in Regex("""(\w+)\.record\(""").findAll(src)) {
            val otelName = observers[call.groupValues[1]] ?: continue
            val args = argumentsOf(src, call.range.last)
            val labels = putKeys(args) +
                namedAttrs.filterKeys { name -> Regex("""\b${Regex.escape(name)}\b""").containsMatchIn(args) }
                    .values.flatten()
            assertTrue(labels.isNotEmpty(), "no attribute source found for `${call.groupValues[1]}.record(…)`")
            result.getOrPut(otelName) { mutableSetOf() } += labels
        }
        assertEquals(
            observers.values.toSet(),
            result.keys,
            "every gauge observer must have at least one attributed record() call",
        )
        return result
    }

    /** The argument list of the call whose opening parenthesis is at [openParen] (balanced). */
    private fun argumentsOf(src: String, openParen: Int): String {
        var depth = 0
        for (i in openParen until src.length) {
            when (src[i]) {
                '(' -> depth++
                ')' -> if (--depth == 0) return src.substring(openParen + 1, i)
            }
        }
        error("unbalanced parentheses at offset $openParen")
    }

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
