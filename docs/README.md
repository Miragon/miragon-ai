# Camunda 7 MCP Ecosystem

Ein MCP-basiertes Ökosystem für Camunda-7-kompatible Process Engines. Bietet KI-gesteuerte Prozessverwaltung über das Model Context Protocol mit 43 Tools, 6 interaktiven UI-Apps und einer ClickHouse-Analytics-Pipeline.

## Was ist das?

Dieses Projekt verbindet Camunda 7 (und kompatible Engines wie CIB Seven und Operaton) mit KI-Assistenten wie Claude oder ChatGPT. Über MCP-Tools kann ein LLM:

- Prozesse starten, Tasks bearbeiten, Incidents resolven
- Historische Daten analysieren und Bottlenecks finden
- Interaktive Dashboards als UI-Komponenten rendern
- OTEL-Traces mit Prozessinstanzen korrelieren

## Vier Säulen

1. **Engine Adapter** — Multi-Engine REST API Abstraktion
2. **MCP Server** — 43 Tools + 3 Resources für Process Management
3. **MCP Apps** — 6 React UI-Komponenten via sunpeak
4. **History Pipeline** — Kotlin Plugins → ClickHouse Analytics

## Unterstützte Engines

| Engine | Status |
|--------|--------|
| CIB Seven | Primär — vollständig unterstützt |
| Camunda 7 | Vollständig unterstützt |
| Operaton | Vorbereitet — Struktur angelegt |
