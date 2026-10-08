# Operations

## Deployment artifact

A single Docker image on Docker Hub, `docker.io/miragon/miragon-ai-server`
(`:<version>` or `:latest`):

```bash
docker run --rm -p 127.0.0.1:8400:8400 \
  -e CAMUNDA_BASE_URL=... \
  -e PROMETHEUS_URL=... \
  docker.io/miragon/miragon-ai-server:latest
```

release-please tags `v<version>`; after manual approval `publish-to-docker.yml`
builds the root `Dockerfile` and pushes both tags. The `HEALTHCHECK` polls
`/health/ready`; SIGTERM drains (readiness 503 `draining`, in-flight requests get
up to 4 s, then the database pool closes). `playground/docker/docker-compose.yml`
binds every port to `127.0.0.1` (`--profile full` adds the server);
`playground/README.md` covers Fly.io (`deploy-playground.yml`).

## Security

Without `MCP_OAUTH` the endpoint is unauthenticated and every module without a
toolset suffix runs **read-only**; with it the server is an OAuth resource
server (Keycloak or Auth0: bearer tokens validated on `/mcp`, 401 otherwise,
`.well-known` metadata served) and the default rises to `operations` /
`standard` — see [Module activation](#module-activation). Tokens must carry the
canonical MCP URL (`MCP_URL`, then required) in `aud` (RFC 8707). `oidc`/`oidc-proxy`
(1.x) fail the boot — front an IdP without Dynamic Client Registration with an
OAuth-terminating gateway. Every request's `Host` (and a POST's `Origin`) must be
localhost-class, `MCP_URL`'s or allow-listed below — else 403 (DNS rebinding).

A gateway or reverse proxy that terminates auth **in front of** the server is
invisible to it: such a deployment runs read-only until `MCP_ACTIVE_MODULES`
names its toolsets. `admin` is only reached by naming it — never on a server
anyone can reach unauthenticated. Deploying a BPMN/DMN is **code execution
inside the engine JVM** (JUEL expressions, scripts), so
`camunda7_create_deployment` also needs `CAMUNDA_ALLOW_DEPLOYMENTS=true`.

`CAMUNDA_AUTH_TYPE=passthrough` forwards each caller's token to the engine
(never to Prometheus), which enforces the caller's permissions if its REST auth
is on. With auth, profiles and saved dashboards scope to the user (`sub`);
without it (mcp-use 2 issues no session ids) settings saves refuse and the
dashboard builder is absent — it also needs every module above read-only.
`docker compose --profile auth up -d` adds a local Keycloak on `:8480` (realm
`miragon`, `demo`/`demo`; see `.env.example`). The public Fly playground is
unauthenticated and pinned to `camunda7:read-only,analytics:read-only`.

## Environment variables

| Variable                                                  | Default                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                                                    | `8400`                              | HTTP port the MCP server listens on                                                                                                                                                                                                                                                                                                                                                                    |
| `MCP_URL`                                                 | —                                   | Public base URL: advertised URLs, the OAuth token audience, and the `Host`/`Origin` the server accepts                                                                                                                                                                                                                                                                                                 |
| `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS`               | localhost-class                     | Further hostnames / origins (comma lists) admitted next to `MCP_URL`'s; an origin without a scheme matches any scheme and port, `*` turns the check off (only behind an edge that validates `Host` itself)                                                                                                                                                                                             |
| `MCP_MAX_BODY_BYTES`                                      | `4194304`                           | Request-body cap (4 MiB): larger bodies get 413 before they are buffered, ahead of the OAuth gate (`pnpm dev` is uncapped)                                                                                                                                                                                                                                                                             |
| `MCP_METRICS_TOKEN`                                       | —                                   | Bearer token `/metrics` then requires (401 otherwise); unset = open like the health probes                                                                                                                                                                                                                                                                                                             |
| `MCP_OAUTH`                                               | —                                   | JSON OAuth resource-server config; providers `keycloak`, `auth0` (`oidc`/`oidc-proxy` were removed with mcp-use 2 and fail the boot) — full field lists in [`.env.example`](https://github.com/Miragon/miragon-ai/blob/main/.env.example)                                                                                                                                                              |
| `MCP_ACTIVE_MODULES`                                      | all, read-only                      | Comma-separated `module` or `module:toolset` entries, e.g. `camunda7:operations,analytics:standard`; no suffix = read-only, under OAuth the standard toolset — see [Module activation](#module-activation)                                                                                                                                                                                             |
| `DATABASE_URL`                                            | —                                   | Postgres for saved dashboards + user profiles (both stores; migrations run at boot). Beats `MCP_*_DIR`; the Compose stack ships an instance on host port `8440`                                                                                                                                                                                                                                        |
| `MCP_DASHBOARD_DIR` / `MCP_PROFILE_DIR`                   | in-memory                           | Directories persisting saved dashboards / user profiles across restarts — the file-based alternative when no `DATABASE_URL` is set                                                                                                                                                                                                                                                                     |
| `MCP_PROFILE_SESSION_TTL_DAYS`                            | `30`                                | Expiry for session-keyed profiles (gateway-stamped `Mcp-Session-Id` or 1.x leftovers), checked at boot + daily. User-bound profiles and the shared stdio `anonymous` record never expire. `0` disables                                                                                                                                                                                                 |
| `REDIS_URL`                                               | —                                   | Ignored since mcp-use 2 (the pluggable session-backend seam was removed upstream; the server warns at boot). Sessions are instance-local — scale out only with sticky routing                                                                                                                                                                                                                          |
| `CAMUNDA_ENGINES_FILE` / `CAMUNDA_ENGINES_JSON`           | —                                   | Engine list as a file path / inline JSON (the file wins; highest precedence): `[{id, baseUrl, cockpitUrl?, environment?, flavor?, auth?}, ...]` or the environment map `{"<environment>": [engines…]}`. `environment` groups engines for the two-stage pickers; `flavor` (`cibseven` \| `operaton` \| `camunda7`, default `cibseven`) selects the vendor's cockpit-link routes — mixed fleets are fine |
| `CAMUNDA_BASE_URL`                                        | `http://localhost:8410/engine-rest` | Legacy single-engine REST endpoint (registered as id `CAMUNDA_ENGINE_ID`); ignored when `CAMUNDA_ENGINES_*` is set. The server warns at boot when no engine source is set at all — the silent fallback works against the Compose engine but breaks the `engine_id` join                                                                                                                                |
| `CAMUNDA_ENGINE_ID`                                       | `default`                           | Engine id for the `CAMUNDA_BASE_URL` shorthand. Must match the engine container's `ENGINE_ID` (= the `engine_id` metric label) or every engine-scoped analytics query — BPMN heatmap, engine compare — comes back empty                                                                                                                                                                                |
| `CAMUNDA_COCKPIT_URL`                                     | derived                             | Used for jump-out links to Cockpit; multi-engine setups use per-engine `cockpitUrl` instead                                                                                                                                                                                                                                                                                                            |
| `CAMUNDA_AUTH_TYPE`                                       | `none`                              | `basic`, `bearer`, `passthrough`, or `none` — fallback for engines without a per-engine `auth`                                                                                                                                                                                                                                                                                                         |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` / `CAMUNDA_TOKEN` | —                                   | Required for `basic` (username + password) / `bearer` (token), enforced at boot                                                                                                                                                                                                                                                                                                                        |
| `CAMUNDA_ALLOW_DEPLOYMENTS`                               | `false`                             | `true` registers `camunda7_create_deployment` (also needs `camunda7:admin`) — deploying runs code inside the engine JVM. Only `true`/`false` (empty = unset); any other value fails the boot                                                                                                                                                                                                           |
| `CAMUNDA_INCIDENT_ISSUE_REPO`                             | —                                   | Default `owner/repo` for the GitHub-issue tool                                                                                                                                                                                                                                                                                                                                                         |
| `CAMUNDA_HEALTH_CRITICAL_*`                               | `50` / `25`                         | `…_INCIDENTS` / `…_CLUSTER_SIZE` — thresholds for the engine-health `critical` verdict                                                                                                                                                                                                                                                                                                                 |
| `CAMUNDA_REQUEST_TIMEOUT_MS` / `PROMETHEUS_TIMEOUT_MS`    | `30000`                             | Per-request deadline (ms) for engine / Prometheus calls: a hung upstream fails the tool call with a timeout error naming it. Whole milliseconds only; anything else fails the boot                                                                                                                                                                                                                     |
| `PROMETHEUS_URL`                                          | `http://localhost:9090`             | Prometheus HTTP API — the analytics data source (the repo's Compose stack publishes `:8460`; the server warns at boot when unset). Auth: `PROMETHEUS_BEARER_TOKEN`, or `PROMETHEUS_USERNAME` + `PROMETHEUS_PASSWORD` (URL userinfo moves there); `PROMETHEUS_HEADERS` adds a JSON object of headers (tenant ids). Ambiguous auth fails the boot                                                        |

Unknown `CAMUNDA_*`/`MCP_*` variables warn at boot; mcp-use telemetry is off
(`MCP_USE_ANONYMIZED_TELEMETRY=true` opts in). The engine container takes
`METRICS_ENABLED`, `ENGINE_ID` (must match the server's engine id, or that
engine's analytics come back empty) and `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_SERVICE_NAME`.

## Module activation

`MCP_ACTIVE_MODULES` lists the modules (unset/`all` = every module) — e.g.
`camunda7` alone where no Prometheus exists (the cockpit drops its
cross-engine view). Each module runs one toolset per boot:

| Toolset               | Surface                                                                                                                        | No-suffix default |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `camunda7:read-only`  | `readOnlyHint` tools only — queries plus `camunda7_engine` `list`/`current`                                                    | without OAuth     |
| `camunda7:operations` | + start, claim/assign/complete tasks, variables, job + external-task retries, resolve incidents, correlate messages            | with OAuth        |
| `camunda7:admin`      | + delete/modify/suspension, migrations, batch retries, signals, the external-task worker protocol, deployments (with the flag) | never             |
| `analytics:read-only` | every analytics tool, no settings save                                                                                         | without OAuth     |
| `analytics:standard`  | + `analytics_save_settings`                                                                                                    | with OAuth        |

An empty (`camunda7:`) or unknown suffix warns and falls back to read-only,
even under OAuth. Widgets hide action buttons whose tool the toolset drops.
The full surface of earlier releases is `camunda7:admin,analytics:standard`
plus `CAMUNDA_ALLOW_DEPLOYMENTS=true`, with `MCP_OAUTH` for the dashboard builder.

## Observability

Three routes sit next to `/mcp`, outside the OAuth gate and the `Host` check:

| Route           | Purpose                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health/live`  | Liveness — 200 as soon as the process serves HTTP                                                                                                                                                                                                                                                                                                             |
| `/health/ready` | Readiness — 200 once the server's own dependencies respond (the Postgres store under `DATABASE_URL`), else 503 naming the failing check. Never probes engines or Prometheus: their outages surface as tool errors, not as an unroutable server. `/health` aliases it (Docker `HEALTHCHECK`, Compose, Fly)                                                     |
| `/metrics`      | Prometheus text — `mcp_tool_calls_total{tool,outcome}`, `mcp_tool_call_duration_seconds{tool}`, `mcp_http_requests_total{method,route,status}`, `mcp_http_request_duration_seconds{method,route}` plus the standard `process_*`/`nodejs_*` collectors. Labels are bounded by construction (tool catalogue, known routes) — never users, sessions or arguments |

HTTP transport logs structured JSON to stdout. The server expects Camunda 7 /
CIB Seven and Prometheus; Grafana is optional (`:8470`). Engine metrics come from
the Kotlin plugin via any Micrometer export (see [Architecture](/architecture));
alert rules ship in `playground/docker/prometheus/alerts.yml`, and
`analytics_engine_health` surfaces the same gauges and firing alerts in one call.

## CI/CD

`.github/workflows/ci.yml` runs parallel jobs on every push — TypeScript (build,
test, lint, format), Kotlin engine plugins, the CIB Seven example — against
public npm dependencies only. This site deploys to Netlify (root `netlify.toml`).
