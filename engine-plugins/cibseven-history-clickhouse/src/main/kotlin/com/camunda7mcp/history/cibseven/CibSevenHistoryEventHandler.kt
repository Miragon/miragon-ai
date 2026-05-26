package com.camunda7mcp.history.cibseven

import com.camunda7mcp.history.ClickHouseClient
import com.camunda7mcp.history.ClickHouseHistoryEventHandlerBase
import com.camunda7mcp.history.ClickHouseProperties
import org.cibseven.bpm.engine.impl.history.event.HistoricProcessInstanceEventEntity
import org.cibseven.bpm.engine.impl.history.event.HistoryEvent
import org.cibseven.bpm.engine.impl.history.handler.HistoryEventHandler
import org.slf4j.LoggerFactory

class CibSevenHistoryEventHandler(client: ClickHouseClient, properties: ClickHouseProperties) :
    ClickHouseHistoryEventHandlerBase(client, properties),
    HistoryEventHandler {

    private val log = LoggerFactory.getLogger(CibSevenHistoryEventHandler::class.java)
    private val eventMapper = CibSevenEventMapper(properties.engineId)

    override fun handleEvent(historyEvent: HistoryEvent) {
        if (historyEvent is HistoricProcessInstanceEventEntity) {
            log.debug(
                "PI event: type={}, state={}, id={}, class={}",
                historyEvent.eventType,
                historyEvent.state,
                historyEvent.processInstanceId,
                historyEvent::class.simpleName,
            )
        }
        val mapped = eventMapper.map(historyEvent) ?: return
        bufferEvent(mapped)
    }

    override fun handleEvents(historyEvents: List<HistoryEvent>) {
        historyEvents.forEach { handleEvent(it) }
    }
}
