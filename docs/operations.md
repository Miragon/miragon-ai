# Operations

## Deployment artifact

A single Docker image. Released builds are published to Docker Hub at
`docker.io/miragon/miragon-ai-server` — pull a tagged version (or `:latest`) and run it:

```bash
docker run --rm -p 8400:8400 \
  -e CAMUNDA_BASE_URL=... \
  -e PROMETHEUS_URL=... \
  docker.io/miragon/miragon-ai-server:latest
```

Releases are cut by release-please: merging the Release PR tags `v<version>`,
and after manual approval `publish-to-docker.yml` builds the root `Dockerfile`
and pushes `:<version>` and `:latest`.

To build it yourself (needs `GITHUB_TOKEN`, a PAT with `read:packages`, as a
BuildKit secret for the private `@miragon` packages):

```bash
docker build --secret id=github_token,env=GITHUB_TOKEN -t miragon-ai-server .
```

`playground/docker/docker-compose.yml` is the fully wired local demo
(`--profile full` adds the server — export `GITHUB_TOKEN`); `playground/README.md`
covers deploying the same stack to Fly.io (`deploy-playground.yml`, manual).

## Security

By default the MCP endpoint is unauthenticated — any client that reaches port
`8400` gets full tool access. Protect it with an authenticating reverse proxy,
or set `MCP_OAUTH` to make the server an OAuth resource server: bearer tokens
on `/mcp` are validated against your IdP (Keycloak, Auth0, or generic
OIDC/JWKS), unauthenticated requests get 401, and the `.well-known` discovery
metadata is served. Set `MCP_URL` so advertised URLs are right.

For an IdP without Dynamic Client Registration, `provider: "oidc-proxy"` uses a
pre-registered `clientId`/`clientSecret` and brokers the login through the
server. It requires `MCP_URL`, `<MCP_URL>/oauth/callback` registered at the
IdP, and `allowedRedirectUris` — the exact MCP-client callbacks the server's
`/authorize` accepts. That allowlist is mandatory and enforced before mcp-use
runs (its proxy otherwise forwards the auth code to any `redirect_uri`).

`CAMUNDA_AUTH_TYPE=passthrough` forwards each caller's bearer token to the
engine per request (never to Prometheus). With `MCP_OAUTH`
the server validates the token and the engine enforces the caller's
permissions — which needs an engine with REST auth enabled; a default engine
accepts anonymous requests and ignores the token.

## Environment variables

| Variable                                | Default                             | Notes                                                                                                                                                                                                                                           |
| --------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                  | `8400`                              | HTTP port the MCP server listens on                                                                                                                                                                                                             |
| `MCP_URL`                               | —                                   | Public base URL the server advertises (resource URIs, OAuth callbacks)                                                                                                                                                                          |
| `MCP_OAUTH`                             | —                                   | JSON OAuth resource-server config; providers `keycloak`, `auth0`, `oidc`, `oidc-proxy` — full field lists in [`.env.example`](https://github.com/Miragon/miragon-ai/blob/main/.env.example)                                                     |
| `MCP_ACTIVE_MODULES`                    | all                                 | Comma-separated `module` or `module:toolset` entries; e.g. `camunda7:read-only,analytics`                                                                                                                                                       |
| `MCP_DASHBOARD_DIR` / `MCP_PROFILE_DIR` | in-memory                           | Directories persisting saved dashboards / user profiles across restarts                                                                                                                                                                         |
| `CAMUNDA_ENGINES_FILE`                  | —                                   | Path to a JSON file with the engine list `[{id, baseUrl, cockpitUrl?, auth?}, ...]`; highest precedence                                                                                                                                         |
| `CAMUNDA_ENGINES_JSON`                  | —                                   | Same engine array as inline JSON; ignored when `CAMUNDA_ENGINES_FILE` is set. Entries take an optional `flavor` (`cibseven` \| `operaton` \| `camunda7`, default `cibseven`) selecting the vendor's cockpit-link routes — mixed fleets are fine |
| `CAMUNDA_BASE_URL`                      | `http://localhost:8410/engine-rest` | Legacy single-engine REST endpoint (registered as id `default`); ignored when `CAMUNDA_ENGINES_*` is set                                                                                                                                        |
| `CAMUNDA_COCKPIT_URL`                   | derived                             | Used for jump-out links to Cockpit; multi-engine setups use per-engine `cockpitUrl` instead                                                                                                                                                     |
| `CAMUNDA_AUTH_TYPE`                     | `none`                              | `basic`, `bearer`, `passthrough`, or `none` — fallback for engines without a per-engine `auth`                                                                                                                                                  |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` | —                                   | Required for `basic` (enforced at boot)                                                                                                                                                                                                         |
| `CAMUNDA_TOKEN`                         | —                                   | Required for `bearer` (enforced at boot)                                                                                                                                                                                                        |
| `CAMUNDA_INCIDENT_ISSUE_REPO`           | —                                   | Default `owner/repo` for the GitHub-issue tool                                                                                                                                                                                                  |
| `CAMUNDA_HEALTH_CRITICAL_*`             | `50` / `25`                         | `…_INCIDENTS` / `…_CLUSTER_SIZE` — thresholds for the engine-health `critical` verdict                                                                                                                                                          |
| `PROMETHEUS_URL`                        | `http://localhost:9090`             | Prometheus HTTP API — the analytics data source (the repo's Compose stack publishes `:8460`; the server warns at boot when unset)                                                                                                               |

Unknown `CAMUNDA_*`/`MCP_*` variables are reported at boot (typos aren't
silently ignored); mcp-use telemetry is off by default
(`MCP_USE_ANONYMIZED_TELEMETRY=true` opts in). The engine container takes
`METRICS_ENABLED`, `ENGINE_ID` (must match the id in `CAMUNDA_ENGINES_*`, or
that engine's analytics come back empty), and the standard `OTEL_*` agent
variables.

## External services

The server expects **Camunda 7 / CIB Seven** and **Prometheus** (scraping the
OTEL Collector's metrics); **Grafana** is optional (`:8470`,
`playground/docker/grafana/`).

## Metrics pipeline

The Kotlin plugin (`engine-plugins/cibseven-history-metrics`) runs inside the
CIB Seven runtime and emits process metrics from the history-event stream via
the OTEL agent (no sampling); the Collector exports them to Prometheus, which
the analytics module queries over PromQL. Per-instance drill-down is not
metric-backed — use the `camunda7_query_historic_*` tools.

## Module activation

Disable a module by listing only the ones you want, e.g.
`MCP_ACTIVE_MODULES=camunda7`. The camunda7 module also takes a toolset suffix
to narrow the tool surface: `camunda7:read-only` (queries + engine selection),
`camunda7:operations` (adds start/complete/claim/variables/retries/messages),
`camunda7:admin` (everything, incl. delete/modify/suspension, deployments,
migrations). No suffix exposes all tools; unknown toolsets warn and fail open.

## Observability

HTTP transport logs structured JSON to stdout. Metrics flow engine → OTEL
Collector → Prometheus (scrape) → Grafana: event-driven counters/histograms
(throughput, durations) plus point-in-time gauges (running WIP, open incidents,
job/task backlog). Alert rules ship in `playground/docker/prometheus/alerts.yml` (wire an
Alertmanager under `alerting:` to route them); the `analytics_engine_health`
tool surfaces the same gauges + firing alerts in one call.

## CI/CD

`.github/workflows/ci.yml` runs parallel jobs on every push — TypeScript
(build, test, lint, format), Kotlin engine plugins, and the CIB Seven example —
installing the private `@miragon` packages via the built-in `GITHUB_TOKEN`.
This docs site deploys to Netlify (root `netlify.toml`; docs-only pnpm
install, so no registry credential is needed there).
