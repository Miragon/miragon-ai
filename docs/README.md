# Camunda 7 MCP Ecosystem

An MCP-based ecosystem for Camunda-7-compatible process engines. Provides
AI-driven process management via the Model Context Protocol with 43 tools,
6 interactive UI apps, and a ClickHouse analytics pipeline.

## What is this?

This project connects Camunda 7 (and compatible engines such as CIB Seven and
Operaton) with AI assistants like Claude or ChatGPT. Through MCP tools, an LLM
can:

- Start processes, work on tasks, resolve incidents
- Analyse historic data and find bottlenecks
- Render interactive dashboards as UI components
- Correlate OTEL traces with process instances

## Five pillars

1. **Engine Adapter** — multi-engine REST API abstraction
2. **MCP Server** — 43 tools + 3 resources for process management
3. **MCP Apps** — 6 React UI components via sunpeak
4. **History Pipeline** — Kotlin plugins → ClickHouse analytics
5. **Enrichment** — opt-in YAML-driven REST lookups for business context

## Supported engines

| Engine    | Status                              |
| --------- | ----------------------------------- |
| CIB Seven | Primary — fully supported           |
| Camunda 7 | Fully supported                     |
| Operaton  | Prepared — module scaffolding ready |
