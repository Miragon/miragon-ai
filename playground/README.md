# Playground

A self-contained demo environment for the Miragon AI Platform: a seeded
CIB Seven engine with live traffic, the full metric-first analytics stack,
and the MCP server on top. Run it locally with Docker Compose, or deploy
the whole stack to Fly.io with one workflow.

| Path                | Contents                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `cibseven-example/` | Spring Boot CIB Seven engine: seeded Miravelo Leasing processes, live traffic, Micrometer metrics (OTLP push) |
| `docker/`           | Compose stack: engine(s), OTEL Collector, Prometheus, Grafana, optional server                                |
| `fly/`              | Fly.io deployment: one `*.fly.toml` per app + `deploy.sh`                                                     |

## Run locally

```sh
docker compose -f playground/docker/docker-compose.yml up -d   # infra: engine, OTEL, Prometheus, Grafana
cp .env.example .env                                           # dev defaults: Prometheus :8460
pnpm dev                                                       # MCP server on :8400
```

- MCP endpoint: `http://localhost:8400/mcp`, inspector: `http://localhost:8400/mcp/inspector`
- Grafana: `http://localhost:8470`, Prometheus: `http://localhost:8460`, engine: `http://localhost:8410`
- Every published port binds to `127.0.0.1` on purpose — the engine REST API
  is anonymous, Grafana runs as anonymous Admin, the rest uses demo
  credentials. From another machine, tunnel instead of rebinding
  (`ssh -L 8400:127.0.0.1:8400 <host>`).
- The server boots **read-only** (no `MCP_OAUTH`, no toolset suffix — the boot
  log names the effective toolsets). To exercise write paths, set
  `MCP_ACTIVE_MODULES=camunda7:admin,analytics:standard` in `.env` (see the
  commented line there); deployments additionally need
  `CAMUNDA_ALLOW_DEPLOYMENTS=true`.
- Compose profiles: `--profile multi-engine` (second engine on :8411),
  `--profile full` (containerized server on :8400), `--profile dev` (plain
  CIB Seven image, no analytics), `--profile auth` (Keycloak on :8480 for
  trying `MCP_OAUTH` locally — see the commented block in `.env.example`)

## Deploy to Fly.io

The stack maps to six Fly apps in one org, wired over Fly's private 6PN
network. Only the server is public — everything else has no public IP, but
6PN is shared by every app in the org: the anonymous engine REST API is
reachable from all of them, so keep untrusted apps out of the org.

| Fly app                            | Service        | Exposure                                             |
| ---------------------------------- | -------------- | ---------------------------------------------------- |
| `miragon-ai-playground`            | MCP server     | public — `https://miragon-ai-playground.fly.dev/mcp` |
| `miragon-ai-playground-engine`     | CIB Seven      | private (`….internal:8410`)                          |
| `miragon-ai-playground-otel`       | OTEL Collector | private (`….internal:4318` / `:9464`)                |
| `miragon-ai-playground-prometheus` | Prometheus     | private (`….internal:9090`), 3 GB volume             |
| `miragon-ai-playground-grafana`    | Grafana        | private — `flyctl proxy 8470:3000 -a <app>`          |
| `miragon-ai-playground-postgres`   | Postgres       | private (`….internal:5432`), 1 GB volume             |

### Via GitHub Actions (recommended)

Run the **Deploy Playground** workflow (`workflow_dispatch`); it builds the
engine jar, then deploys all apps (or a single one via the `target` input).
One-time setup:

- Repo secret `FLY_API_TOKEN`: an org-scoped deploy token —
  `fly tokens create org -o miragon` — stored including the leading `FlyV1 `
  prefix. It must be org-scoped because `deploy.sh` creates missing apps on
  first run, and the nightly **Reset Playground** workflow reaches two apps
  (engine + Prometheus). An app-scoped `fly tokens create deploy` token is
  rejected as `unauthorized`.
- Optional repo variable `FLY_ORG` if the apps should not live in `miragon`.

### Via CLI

```sh
fly auth login
(cd playground/cibseven-example && ./gradlew bootJar)   # engine image copies the jar
./playground/fly/deploy.sh all                          # or: otel|engine|prometheus|grafana|postgres|server
```

First deploy creates the apps and the Prometheus + Postgres volumes.
Afterwards, point an MCP client (e.g. claude.ai custom connector) at
`https://miragon-ai-playground.fly.dev/mcp`.

### Notes

- The MCP endpoint is **unauthenticated** and pinned **read-only** —
  `MCP_ACTIVE_MODULES=camunda7:read-only,analytics:read-only` in
  `fly/server-camunda7.fly.toml`: anyone can query the demo engine, nobody
  can change it through the server (no engine writes, settings saves or
  dashboard builder). Never widen it there and never set
  `CAMUNDA_ALLOW_DEPLOYMENTS` on this app (deploying a BPMN runs code in the
  engine JVM).
- A Fly **secret** overrides an `[env]` entry of the same name — if
  `fly secrets list -a miragon-ai-playground` shows `MCP_ACTIVE_MODULES`,
  keep it in sync with the toml (or `fly secrets unset` it). `MCP_OAUTH` as a
  secret adds login (`fly secrets set MCP_OAUTH='…' -a
miragon-ai-playground`, see `.env.example`); the pin still keeps it
  read-only.
- The engine keeps its H2 database in memory: every engine restart reseeds
  (~600 instances) and live traffic keeps metrics moving. Prometheus history
  survives restarts on its volume.
- User settings + saved dashboards persist to the Postgres app once its
  secrets are set (one-time, see `fly/postgres.fly.toml`):
  `fly secrets set POSTGRES_PASSWORD=<pw> -a miragon-ai-playground-postgres`
  and the matching `DATABASE_URL` secret on `miragon-ai-playground`. Without
  the `DATABASE_URL` secret the server keeps its in-memory stores.
- Everything runs single-machine (`--ha=false`), sized for demos, roughly
  $15–25/month; the server scales to zero when idle. Tear down with
  `fly apps destroy <app>` per app.
