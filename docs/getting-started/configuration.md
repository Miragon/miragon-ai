# Configuration

All configuration is supplied through environment variables.

## Engine

| Variable           | Default                             | Description                                     |
| ------------------ | ----------------------------------- | ----------------------------------------------- |
| `ENGINE_TYPE`      | `cibseven`                          | Engine type: `camunda7`, `cibseven`, `operaton` |
| `ENGINE_BASE_URL`  | `http://localhost:8080/engine-rest` | REST API base URL                               |
| `ENGINE_AUTH_TYPE` | `basic`                             | Authentication mode: `basic`, `bearer`, `none`  |
| `ENGINE_USERNAME`  | —                                   | Username (for `basic`)                          |
| `ENGINE_PASSWORD`  | —                                   | Password (for `basic`)                          |
| `ENGINE_TOKEN`     | —                                   | Token (for `bearer`)                            |

## ClickHouse

| Variable              | Default                 | Description              |
| --------------------- | ----------------------- | ------------------------ |
| `CLICKHOUSE_ENABLED`  | `false`                 | Enable ClickHouse tools  |
| `CLICKHOUSE_URL`      | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USER`     | `camunda`               | ClickHouse user          |
| `CLICKHOUSE_PASSWORD` | `camunda123`            | ClickHouse password      |
| `CLICKHOUSE_DATABASE` | `camunda_history`       | Default database         |

## Enrichment

| Variable                 | Default | Description                                                                                              |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `ENRICHMENT_CONFIG_PATH` | —       | Absolute path to an enrichment YAML. When set, registers the lookup tools and `enrichment_auto_resolve`. |

The path is resolved against `process.cwd()` of the server, so an absolute
path is the safest choice. Two ready-to-run examples live under
`server/resources/enrichment-examples/`:

- `loanApproval-local.yaml` — pairs with the `cibseven-example` seed
  (`customerSegment`, `currency`, `channel`).
- `acme-local.yaml` — generic Salesforce / ERP / Contracts shape.

Both target the WireMock sidecar on `localhost:8088`, so no external
credentials are needed. See [enrichment YAML reference](../mcp-server/tools-reference.md#enrichment-mcp)
for the full schema.

Leave the variable unset to disable enrichment entirely (no boot error).

## OTEL

| Variable                      | Default                 | Description                 |
| ----------------------------- | ----------------------- | --------------------------- |
| `OTEL_ENABLED`                | `true`                  | Enable OTEL instrumentation |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTEL collector endpoint     |

## Example: minimal config

```env
ENGINE_TYPE=cibseven
ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENGINE_AUTH_TYPE=basic
ENGINE_USERNAME=demo
ENGINE_PASSWORD=demo
```

## Example: full config

```env
ENGINE_TYPE=cibseven
ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENGINE_AUTH_TYPE=basic
ENGINE_USERNAME=demo
ENGINE_PASSWORD=demo

CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=camunda
CLICKHOUSE_PASSWORD=camunda123

ENRICHMENT_CONFIG_PATH=/abs/path/to/server/resources/enrichment-examples/loanApproval-local.yaml

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```
