# History Pipeline

## Overview

The history pipeline streams engine history events into ClickHouse in
near-real-time. It has three layers:

1. **Engine-specific plugins** — intercept history events
2. **Shared library** — engine-agnostic buffering + ClickHouse client
3. **ClickHouse** — column-oriented analytics store

```
Engine (CIB Seven)
    │ history events
    ▼
CibSevenHistoryPlugin
    │ maps to Map<String, Any?>
    ▼
ClickHouseHistoryEventHandlerBase
    │ buffering (batch-size + flush-interval)
    ▼
ClickHouseClient (JDBC)
    │ batch INSERT
    ▼
ClickHouse (5 tables)
```

## Tables

| Table                        | Content                    |
| ---------------------------- | -------------------------- |
| `camunda_process_instances`  | Process instance lifecycle |
| `camunda_activity_instances` | Activity executions        |
| `camunda_task_instances`     | User task lifecycle        |
| `camunda_variable_updates`   | Variable changes           |
| `camunda_incidents`          | Incidents / failures       |

Every table carries `engine_type` (`camunda7`, `cibseven`, `operaton`) and
`trace_id` for OTEL correlation.

## Nullable timestamps

`end_time`, `due_date`, `follow_up_date`, `incident.create_time` and
`incident.end_time` are all nullable in the engine model — running instances
have no end timestamp, tasks may have no due date, etc.

The ClickHouse JDBC driver (`com.clickhouse.client.api.DataTypeUtils`) refuses
`null` for `Timestamp` parameters. The client therefore binds nullable
timestamps via `setNull(idx, Types.TIMESTAMP)` rather than
`setTimestamp(idx, null)`. Non-nullable lifecycle anchors
(`process_instances.start_time`, `activity_instances.start_time`, …) keep the
direct `setTimestamp` path with the standard fallback chain.

See `plugins/shared-history-clickhouse/.../ClickHouseClient.kt` (`bindTimestamp`).

## OTEL instrumentation

The Kotlin plugins are instrumented with OpenTelemetry:

- `history.flush` span around each flush operation
- `history.insert.<table>` span per table insert
- Metrics: `history.flush.duration_ms`, `history.events.buffered_total`,
  `history.events.inserted_total`, `history.insert.errors_total`

## Configuration

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
