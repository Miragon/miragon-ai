# History Pipeline

## Überblick

Die History Pipeline schiebt Engine-History-Events in Echtzeit nach ClickHouse. Sie besteht aus:

1. **Engine-spezifische Plugins** — fangen History-Events ab
2. **Shared Library** — engine-agnostische Pufferung + ClickHouse-Client
3. **ClickHouse** — spaltenorientierte Analytik-Datenbank

```
Engine (CIB Seven)
    │ History Events
    ▼
CibSevenHistoryPlugin
    │ mappt auf Map<String, Any?>
    ▼
ClickHouseHistoryEventHandlerBase
    │ Buffering (batch-size + flush-interval)
    ▼
ClickHouseClient (JDBC)
    │ Batch INSERT
    ▼
ClickHouse (5 Tabellen)
```

## Tabellen

| Tabelle | Inhalt |
|---------|--------|
| `camunda_process_instances` | Prozessinstanz-Lifecycle |
| `camunda_activity_instances` | Activity-Ausführungen |
| `camunda_task_instances` | User Task-Lifecycle |
| `camunda_variable_updates` | Variablen-Änderungen |
| `camunda_incidents` | Incidents/Fehler |

Alle Tabellen enthalten `engine_type` (`camunda7`, `cibseven`, `operaton`) und `trace_id` für OTEL-Korrelation.

## OTEL Instrumentierung

Die Kotlin Plugins sind mit OpenTelemetry instrumentiert:

- `history.flush` Span um jede Flush-Operation
- `history.insert.<table>` Span pro Tabellen-Insert
- Metriken: `history.flush.duration_ms`, `history.events.buffered_total`, `history.events.inserted_total`, `history.insert.errors_total`

## Konfiguration

```yaml
camunda7mcp:
  history:
    clickhouse:
      enabled: true
      url: jdbc:clickhouse://localhost:8123/camunda_history
      username: camunda
      password: camunda123
      batch-size: 100
      flush-interval-seconds: 5
```
