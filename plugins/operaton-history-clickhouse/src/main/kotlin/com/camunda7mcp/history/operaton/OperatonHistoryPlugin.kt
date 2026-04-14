package com.camunda7mcp.history.operaton

// TODO: Implement in Phase 5
// Analogous to CibSevenHistoryPlugin but with:
// - org.operaton.bpm.engine.impl.cfg.AbstractProcessEnginePlugin
// - org.operaton.bpm.engine.impl.history.event.*
// - engine_type = "operaton"
//
// Structure:
// class OperatonHistoryPlugin : AbstractProcessEnginePlugin() { ... }
// class OperatonHistoryEventHandler : ClickHouseHistoryEventHandlerBase(...), HistoryEventHandler { ... }
// class OperatonEventMapper { ... }
