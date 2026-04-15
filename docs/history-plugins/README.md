# History Plugins

Die History Plugins schieben Engine-History-Events in Echtzeit nach ClickHouse. Jede unterstützte Engine hat ein eigenes Plugin, das die gemeinsame Shared Library nutzt.

## Module

| Plugin                        | Engine            | Status      |
| ----------------------------- | ----------------- | ----------- |
| `shared-history-clickhouse`   | Engine-agnostisch | Aktiv       |
| `camunda7-history-clickhouse` | Camunda 7         | Aktiv       |
| `cibseven-history-clickhouse` | CIB Seven         | Aktiv       |
| `operaton-history-clickhouse` | Operaton          | Platzhalter |

## Funktionsweise

1. Engine feuert History-Event (z.B. `HistoricProcessInstanceEventEntity`)
2. Plugin-spezifischer EventMapper wandelt in `Map<String, Any?>` um
3. `ClickHouseHistoryEventHandlerBase` puffert Events
4. Bei Batch-Größe oder Timer: Flush nach ClickHouse
5. `ClickHouseClient` führt Batch-INSERT aus

## OTEL Instrumentierung

Alle Plugins sind mit OpenTelemetry instrumentiert. Der OTEL Java Agent (wenn angehängt) konfiguriert `GlobalOpenTelemetry` automatisch — die Plugins nutzen nur die API.

Schema-Referenz: [clickhouse-schema.md](clickhouse-schema.md)
