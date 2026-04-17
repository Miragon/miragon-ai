package com.camunda7mcp.history.camunda7

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase
import com.camunda7mcp.history.ClickHouseProperties
import org.camunda.bpm.engine.impl.history.event.HistoryEvent
import org.camunda.bpm.engine.impl.history.handler.HistoryEventHandler

class Camunda7HistoryEventHandler(client: ClickHouseClient, properties: ClickHouseProperties) :
    ClickHouseHistoryEventHandlerBase(client, properties),
    HistoryEventHandler {

    private val eventMapper = Camunda7EventMapper()

    override fun handleEvent(historyEvent: HistoryEvent) {
        val mapped = eventMapper.map(historyEvent) ?: return
        bufferEvent(mapped)
    }

    override fun handleEvents(historyEvents: List<HistoryEvent>) {
        historyEvents.forEach { handleEvent(it) }
    }
}
