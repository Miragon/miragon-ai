package com.camunda7mcp.history.camunda7

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseProperties
import org.camunda.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
import org.camunda.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl
import org.camunda.bpm.engine.impl.history.handler.CompositeDbHistoryEventHandler
import org.springframework.stereotype.Component

@Component
class Camunda7HistoryPlugin(
    private val clickHouseClient: ClickHouseClient,
    private val properties: ClickHouseProperties,
) : AbstractProcessEnginePlugin() {

    override fun preInit(config: ProcessEngineConfigurationImpl) {
        val clickHouseHandler = Camunda7HistoryEventHandler(clickHouseClient, properties)

        val compositeHandler = CompositeDbHistoryEventHandler(
            listOf(clickHouseHandler)
        )
        config.historyEventHandler = compositeHandler
    }
}
