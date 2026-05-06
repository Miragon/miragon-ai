# Operations

Everything you need to run the platform somewhere other than your laptop.

## Deployment artifact

A single Docker image, built from the repo root `Dockerfile`. Multi-stage build,
pruned production dependencies, exposes port `3010`.

```bash
docker build -t miragon-ai-server .
docker run --rm -p 3010:3010 \
  -e CAMUNDA_BASE_URL=... \
  -e CLICKHOUSE_URL=... \
  miragon-ai-server
```

The Compose stack under `docker/docker-compose.yml` shows a fully wired example
(`--profile full` brings up the server alongside the engine and ClickHouse).

## Environment variables

| Variable                                | Default                             | Notes                                                |
| --------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `PORT`                                  | `3010`                              | HTTP port for the MCP transport                      |
| `MCP_ACTIVE_MODULES`                    | all                                 | Comma-separated; e.g. `camunda7,analytics`           |
| `CAMUNDA_BASE_URL`                      | `http://localhost:8080/engine-rest` | Engine REST endpoint                                 |
| `CAMUNDA_COCKPIT_URL`                   | derived                             | Used for jump-out links to Cockpit                   |
| `CAMUNDA_AUTH_TYPE`                     | `none`                              | `basic`, `bearer`, or `none`                         |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` | —                                   | Required for `basic`                                 |
| `CAMUNDA_TOKEN`                         | —                                   | Required for `bearer`                                |
| `CAMUNDA_INCIDENT_ISSUE_REPO`           | —                                   | Default `owner/repo` for the GitHub-issue tool       |
| `CLICKHOUSE_URL`                        | `http://localhost:8123`             | HTTP endpoint                                        |
| `CLICKHOUSE_USERNAME`                   | `default`                           |                                                      |
| `CLICKHOUSE_PASSWORD`                   | _(empty)_                           |                                                      |
| `CLICKHOUSE_DATABASE`                   | `camunda_history`                   |                                                      |
| `ENRICHMENT_CONFIG_PATH`                | —                                   | Path to a YAML file; activates the enrichment module |

## External services

The server expects two services to be reachable:

1. **Camunda 7 / CIB Seven** — the engine itself.
2. **ClickHouse** with the `camunda_history` schema initialized
   (`docker/clickhouse/init-schema.sql`).

Optional:

- **OTEL collector + Jaeger** — turn on with `docker compose --profile otel up`.
  Jaeger UI runs on `:16686`.
- **WireMock** — local HTTP stubs for the enrichment examples (`:8088`).

## History pipeline

The Kotlin plugins under `plugins/` ship inside the CIB Seven runtime and
forward history events to ClickHouse. They are versioned and built independently
from the Node server (`./gradlew clean build` inside `plugins/`). CI runs both
toolchains in parallel — see `.github/workflows/ci.yml`.

## Module activation

Disable any module by listing only the ones you want:

```bash
MCP_ACTIVE_MODULES=camunda7
```

The `enrichment` module stays inactive unless `ENRICHMENT_CONFIG_PATH` is set,
even if it's listed.

## Observability

- HTTP transport logs structured JSON to stdout — pick it up with whatever log
  shipper you already use.
- OTEL traces from the engine flow through the collector into ClickHouse and
  Jaeger; the analytics module can correlate them with process instances.

## CI/CD

`.github/workflows/ci.yml` runs two parallel jobs on every push:

| Job        | What it does                                           |
| ---------- | ------------------------------------------------------ |
| TypeScript | `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` |
| Kotlin     | `./gradlew build` for the history plugins              |

A `TOOLKIT_PAT` secret is required for the private submodule checkout.
