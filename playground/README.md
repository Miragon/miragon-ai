# Playground

A self-contained demo environment for the Miragon AI Platform: a seeded
CIB Seven engine with live traffic, the full metric-first analytics stack,
a federated mock upstream, and the MCP gateway on top. Run it locally with
Docker Compose, or deploy the whole stack to Fly.io with one workflow.

| Path                 | Contents                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `cibseven-example/`  | Spring Boot CIB Seven engine: seeded Miravelo Leasing processes, live traffic, OTEL metrics |
| `miravelo-upstream/` | Mock CRM/leasing MCP upstream — federated step + remote widget (see its README)             |
| `docker/`            | Compose stack: engine(s), OTEL Collector, Prometheus, Grafana, optional gateway             |
| `fly/`               | Fly.io deployment: one `*.fly.toml` per app + `deploy.sh`                                   |

## Run locally

```sh
docker compose -f playground/docker/docker-compose.yml up -d   # infra: engine, OTEL, Prometheus, Grafana
cp .env.example .env                                           # dev defaults: Prometheus :8460, miravelo proxy
pnpm dev                                                       # miravelo upstream + MCP gateway on :8400
```

- MCP endpoint: `http://localhost:8400/mcp`, inspector: `http://localhost:8400/inspector`
- Grafana: `http://localhost:8470`, Prometheus: `http://localhost:8460`, engine: `http://localhost:8410`
- Compose profiles: `--profile multi-engine` (second engine on :8411),
  `--profile full` (containerized gateway on :8400), `--profile dev` (plain
  CIB Seven image, no analytics)

## Deploy to Fly.io

The stack maps to six Fly apps in one org, wired over Fly's private 6PN
network. Only the gateway is public — everything else has no public IP.

| Fly app                            | Service        | Exposure                                             |
| ---------------------------------- | -------------- | ---------------------------------------------------- |
| `miragon-ai-playground`            | MCP gateway    | public — `https://miragon-ai-playground.fly.dev/mcp` |
| `miragon-ai-playground-engine`     | CIB Seven      | private (`….internal:8410`)                          |
| `miragon-ai-playground-otel`       | OTEL Collector | private (`….internal:4318` / `:9464`)                |
| `miragon-ai-playground-prometheus` | Prometheus     | private (`….internal:9090`), 3 GB volume             |
| `miragon-ai-playground-grafana`    | Grafana        | private — `flyctl proxy 8470:3000 -a <app>`          |
| `miragon-ai-playground-miravelo`   | Mock upstream  | private (`….internal:8401`)                          |

### Via GitHub Actions (recommended)

Run the **Deploy Playground** workflow (`workflow_dispatch`); it builds the
engine jar, then deploys all apps (or a single one via the `target` input).
One-time setup:

- Repo secret `FLY_API_TOKEN`: an org-scoped deploy token —
  `fly tokens create org` — stored including the leading `FlyV1 ` prefix
  (org-scoped because `deploy.sh` creates missing apps on first run).
- Optional repo variable `FLY_ORG` if the apps should not live in `personal`.

### Via CLI

```sh
fly auth login
(cd playground/cibseven-example && ./gradlew bootJar)   # engine image copies the jar
export GITHUB_TOKEN=ghp_xxx                             # read:packages, for gateway + miravelo builds
./playground/fly/deploy.sh all                          # or: otel|engine|miravelo|prometheus|grafana|gateway
```

First deploy creates the apps and the Prometheus volume. Afterwards, point an
MCP client (e.g. claude.ai custom connector) at
`https://miragon-ai-playground.fly.dev/mcp`.

### Notes

- The MCP endpoint is **unauthenticated** by default — it exposes demo data
  on a throwaway engine. To put OAuth in front, set the `MCP_OAUTH` config as
  a Fly secret on the gateway app (`fly secrets set MCP_OAUTH='…' -a
miragon-ai-playground`, see `.env.example`).
- The engine keeps its H2 database in memory: every engine restart reseeds
  (~600 instances) and live traffic keeps metrics moving. Prometheus history
  survives restarts on its volume.
- Everything runs single-machine (`--ha=false`), sized for demos, roughly
  $15–25/month; the gateway scales to zero when idle. Tear down with
  `fly apps destroy <app>` per app.
