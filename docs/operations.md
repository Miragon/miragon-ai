# Operations

Everything you need to run the platform somewhere other than your laptop.

## Deployment artifact

A single Docker image, built from the repo root `Dockerfile`. Multi-stage build,
pruned production dependencies, exposes port `8400`. The build needs
`GITHUB_TOKEN` exported in your shell (a PAT with `read:packages`) — it is
mounted as a BuildKit secret to fetch the private `@miragon` packages.

```bash
docker build --secret id=github_token,env=GITHUB_TOKEN -t miragon-ai-server .
docker run --rm -p 8400:8400 \
  -e CAMUNDA_BASE_URL=... \
  -e PROMETHEUS_URL=... \
  miragon-ai-server
```

The Compose stack under `docker/docker-compose.yml` shows a fully wired example
(`--profile full` brings up the server alongside the engine, OTEL Collector,
Prometheus, and Grafana — export `GITHUB_TOKEN` first, the image build reads it
as a secret too).

## Security

The MCP endpoint is unauthenticated — any client that reaches port `8400` gets
full tool access. Deploy the gateway only behind an authenticating reverse
proxy. `MCP_URL` (the public base URL) is required when any `MCP_PROXIES` entry
uses `auth.mode: "oauth2"`; it doubles as the OAuth callback base URL.

## Environment variables

| Variable                                | Default                             | Notes                                                                                                                                         |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                  | `8400`                              | HTTP port for the MCP transport                                                                                                               |
| `MCP_URL`                               | —                                   | Public base URL the server advertises (resource URIs, OAuth callbacks)                                                                        |
| `MCP_ACTIVE_MODULES`                    | all                                 | Comma-separated `module` or `module:toolset` entries; e.g. `camunda7:read-only,analytics`                                                     |
| `MCP_PROXIES`                           | —                                   | JSON array of upstream MCP proxies, `[{name, label, upstreamUrl, auth}]` per the `ProxyConfigSchema` of `@miragon/mcp-toolkit-proxy-contract` |
| `CAMUNDA_ENGINES_FILE`                  | —                                   | Path to a JSON file with the engine list `[{id, baseUrl, cockpitUrl?}, ...]`; highest precedence                                              |
| `CAMUNDA_ENGINES_JSON`                  | —                                   | Same engine array as inline JSON; ignored when `CAMUNDA_ENGINES_FILE` is set                                                                  |
| `CAMUNDA_BASE_URL`                      | `http://localhost:8410/engine-rest` | Legacy single-engine REST endpoint (registered as id `default`); ignored when `CAMUNDA_ENGINES_*` is set                                      |
| `CAMUNDA_COCKPIT_URL`                   | derived                             | Used for jump-out links to Cockpit; multi-engine setups use per-engine `cockpitUrl` instead                                                   |
| `CAMUNDA_AUTH_TYPE`                     | `none`                              | `basic`, `bearer`, or `none`                                                                                                                  |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` | —                                   | Required for `basic`                                                                                                                          |
| `CAMUNDA_TOKEN`                         | —                                   | Required for `bearer`                                                                                                                         |
| `CAMUNDA_INCIDENT_ISSUE_REPO`           | —                                   | Default `owner/repo` for the GitHub-issue tool                                                                                                |
| `PROMETHEUS_URL`                        | `http://localhost:9090`             | Prometheus HTTP API — the analytics data source                                                                                               |

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

The camunda7 module also takes a toolset suffix to narrow the advertised tool
surface: `camunda7:read-only` (queries + engine selection only),
`camunda7:operations` (adds start/complete/claim/variables/retries/messages),
`camunda7:admin` (everything, incl. delete/modify/suspension, deployments,
migrations). No suffix exposes all tools; unknown toolsets warn and fail open.

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
