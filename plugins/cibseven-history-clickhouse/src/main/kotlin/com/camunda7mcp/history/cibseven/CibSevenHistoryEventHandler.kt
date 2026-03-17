package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase
import com.camunda7mcp.history.ClickHouseProperties
import org.cibseven.bpm.engine.impl.history.event.HistoryEvent
import org.cibseven.bpm.engine.impl.history.handler.HistoryEventHandler

class CibSevenHistoryEventHandler(
    client: ClickHouseClient,
    properties: ClickHouseProperties,
) : ClickHouseHistoryEventHandlerBase(client, properties), HistoryEventHandler {

    private val eventMapper = CibSevenEventMapper()

    override fun handleEvent(historyEvent: HistoryEvent) {
        val mapped = eventMapper.map(historyEvent) ?: return
        bufferEvent(mapped)
    }

    override fun handleEvents(historyEvents: List<HistoryEvent>) {
        historyEvents.forEach { handleEvent(it) }
    }
}
