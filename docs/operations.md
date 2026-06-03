# Operations

Everything you need to run the platform somewhere other than your laptop.

## Deployment artifact

A single Docker image, built from the repo root `Dockerfile`. Multi-stage build,
pruned production dependencies, exposes port `8400`.

```bash
docker build -t miragon-ai-server .
docker run --rm -p 8400:8400 \
  -e CAMUNDA_BASE_URL=... \
  -e PROMETHEUS_URL=... \
  miragon-ai-server
```

The Compose stack under `docker/docker-compose.yml` shows a fully wired example
(`--profile full` brings up the server alongside the engine, OTEL Collector,
Prometheus, and Grafana).

## Environment variables

| Variable                                | Default                             | Notes                                           |
| --------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `PORT`                                  | `8400`                              | HTTP port for the MCP transport                 |
| `MCP_ACTIVE_MODULES`                    | all                                 | Comma-separated; e.g. `camunda7,analytics`      |
| `CAMUNDA_BASE_URL`                      | `http://localhost:8410/engine-rest` | Engine REST endpoint                            |
| `CAMUNDA_COCKPIT_URL`                   | derived                             | Used for jump-out links to Cockpit              |
| `CAMUNDA_AUTH_TYPE`                     | `none`                              | `basic`, `bearer`, or `none`                    |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` | —                                   | Required for `basic`                            |
| `CAMUNDA_TOKEN`                         | —                                   | Required for `bearer`                           |
| `CAMUNDA_INCIDENT_ISSUE_REPO`           | —                                   | Default `owner/repo` for the GitHub-issue tool  |
| `PROMETHEUS_URL`                        | `http://localhost:9090`             | Prometheus HTTP API — the analytics data source |

The engine container takes its own variables (see `docker/docker-compose.yml`):
`METRICS_ENABLED` (default `true`), `ENGINE_ID` (the `engine_id` metric label),
and the standard `OTEL_*` agent variables.

## External services

The server expects:

1. **Camunda 7 / CIB Seven** — the engine itself.
2. **Prometheus** scraping the OTEL Collector's process metrics.

Optional:

- **Grafana** — provisioned dashboards on `:8470` (`docker/grafana/`).
- **Jaeger** — trace UI on `:8440`, fed by the OTEL event-bridge.

## Metrics pipeline

The Kotlin plugin under `engine-plugins/cibseven-history-metrics` ships inside
the CIB Seven runtime and emits process metrics from the history-event stream
via the OTEL agent (100 % coverage, no sampling). The OTEL Collector exports
them to Prometheus; the analytics module queries Prometheus over PromQL. The
plugins build independently from the Node gateway (`./gradlew clean build`
inside `engine-plugins/`). CI runs both toolchains — see `.github/workflows/ci.yml`.

Per-instance drill-down (search, single-instance traces) is not metric-backed —
use the `camunda7_query_historic_*` tools and Jaeger.

## Module activation

Disable any module by listing only the ones you want:

```bash
MCP_ACTIVE_MODULES=camunda7
```

## Observability

- HTTP transport logs structured JSON to stdout — pick it up with whatever log
  shipper you already use.
- Process metrics flow engine → OTEL Collector → Prometheus (scrape) → Grafana.
  Two kinds: event-driven counters/histograms (throughput, durations) and
  point-in-time gauges polled from the engine (running WIP, open incidents, job
  backlog/dead jobs, task backlog) — the latter are the live-ops/alerting signals.
- Engine traces flow through the Collector into Jaeger.
- CIB Seven alert rules ship in `docker/prometheus/alerts.yml` (dead jobs,
  stalled executor, job/task/external-task backlog, engine down). Prometheus
  evaluates them; wire an Alertmanager under `alerting:` to route notifications.
  The `analytics_engine_health` MCP tool surfaces the same gauges + firing
  alerts as a one-call snapshot.

## CI/CD

`.github/workflows/ci.yml` runs two parallel jobs on every push:

| Job        | What it does                                           |
| ---------- | ------------------------------------------------------ |
| TypeScript | `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint` |
| Kotlin     | `./gradlew build` for the engine plugins               |

A `TOOLKIT_PAT` secret is required for the private submodule checkout.
