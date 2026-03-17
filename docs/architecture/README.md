# Architektur

Das Ecosystem besteht aus vier Hauptkomponenten:

```
┌──────────────────────────────────────────────────────────────┐
│                    MCP Host (Claude, ChatGPT, ...)           │
│  ┌────────────────────┐  ┌─────────────────────────────────┐ │
│  │  MCP Apps (sunpeak) │  │  camunda7-mcp-server           │ │
│  │  6 React UI Apps   │  │  43 Tools + 3 Resources        │ │
│  └────────┬───────────┘  └──────────┬──────────────────────┘ │
└───────────┼─────────────────────────┼────────────────────────┘
            ▼                         ▼
┌───────────────────────┐   ┌──────────────────────────┐
│  Engine Adapter       │   │  ClickHouse              │
│  Camunda7 / CIBSeven  │   │  + clickhouse-mcp-server │
│  / Operaton           │   │                          │
└───────────┬───────────┘   └──────────┬───────────────┘
            ▼                          ▲
┌───────────────────────┐    History Events
│  Engine (REST API)    │    (Kotlin Plugins)
│  + History Plugin     ├──────────────┘
└───────────────────────┘
```

## Design-Prinzipien

1. **Engine-Agnostik**: Alle Pakete arbeiten über den Engine Adapter, nie direkt gegen eine Engine-API
2. **MCP-First**: Alle Funktionalität ist als MCP-Tool oder -Resource exponiert
3. **Composable Docker**: Infrastruktur über kombinierbare Docker Compose Files
4. **OTEL-Instrumented**: Durchgängiges Tracing von MCP-Tool bis Engine-Call
