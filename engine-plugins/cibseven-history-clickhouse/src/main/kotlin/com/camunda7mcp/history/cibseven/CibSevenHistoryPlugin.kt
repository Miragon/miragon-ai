package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseProperties
import org.cibseven.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl
import org.cibseven.bpm.engine.impl.history.handler.CompositeDbHistoryEventHandler
import org.springframework.stereotype.Component

@Component
class CibSevenHistoryPlugin(private val clickHouseClient: ClickHouseClient, private val properties: ClickHouseProperties) :
    AbstractProcessEnginePlugin() {

    override fun preInit(config: ProcessEngineConfigurationImpl) {
        val clickHouseHandler = CibSevenHistoryEventHandler(clickHouseClient, properties)

        val compositeHandler = CompositeDbHistoryEventHandler(
            listOf(clickHouseHandler),
        )
        config.historyEventHandler = compositeHandler
    }
}
