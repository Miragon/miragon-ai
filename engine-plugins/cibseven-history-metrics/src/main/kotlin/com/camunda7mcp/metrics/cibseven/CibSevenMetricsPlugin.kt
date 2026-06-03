package com.camunda7mcp.metrics.cibseven

import org.cibseven.bpm.engine.ProcessEngine
import org.cibseven.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl
import org.cibseven.bpm.engine.impl.history.handler.CompositeDbHistoryEventHandler
import org.cibseven.bpm.engine.impl.history.handler.CompositeHistoryEventHandler
import org.springframework.stereotype.Component

/**
 * Wires the engine's metric emitters:
 *  - [MetricsHistoryEventHandler] for event-driven counters/histograms (in
 *    `postInit`).
 *  - [EngineStateMetrics] for point-in-time gauges (in `postProcessEngineBuild`,
 *    where the built [ProcessEngine] and its query services are available).
 *
 * The history handler is added to the engine's existing
 * [CompositeHistoryEventHandler] (order-independent; does NOT wrap an existing
 * composite in a second [CompositeDbHistoryEventHandler], which would register a
 * duplicate DB handler and double-persist history).
 */
@Component
class CibSevenMetricsPlugin(private val properties: MetricsProperties) : AbstractProcessEnginePlugin() {

    // Held so the observable-gauge callbacks are not garbage-collected.
    private var engineState: EngineStateMetrics? = null

    override fun postInit(config: ProcessEngineConfigurationImpl) {
        val handler = MetricsHistoryEventHandler(properties.engineId)
        when (val existing = config.historyEventHandler) {
            is CompositeHistoryEventHandler -> existing.add(handler)
            null -> config.historyEventHandler = CompositeDbHistoryEventHandler(listOf(handler))
            else -> config.historyEventHandler = CompositeDbHistoryEventHandler(listOf(existing, handler))
        }
    }

    override fun postProcessEngineBuild(processEngine: ProcessEngine) {
        engineState = EngineStateMetrics(processEngine, properties.engineId).also { it.register() }
    }
}
