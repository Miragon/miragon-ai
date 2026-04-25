# History Plugins

The history plugins push engine history events into ClickHouse in
near-real-time. Every supported engine has its own plugin that builds on the
shared library.

## Modules

| Plugin                        | Engine          | Status |
| ----------------------------- | --------------- | ------ |
| `shared-history-clickhouse`   | engine-agnostic | Active |
| `cibseven-history-clickhouse` | CIB Seven       | Active |

## How it works

1. The engine emits a history event (e.g. `HistoricProcessInstanceEventEntity`)
2. A plugin-specific EventMapper turns it into `Map<String, Any?>`
3. `ClickHouseHistoryEventHandlerBase` buffers events
4. Once batch size or timer triggers, flush to ClickHouse
5. `ClickHouseClient` runs a batch INSERT

## OTEL instrumentation

Every plugin is instrumented with OpenTelemetry. The OTEL Java Agent (when
attached) configures `GlobalOpenTelemetry` automatically — the plugins only
use the API.

Schema reference: [clickhouse-schema.md](clickhouse-schema.md)
