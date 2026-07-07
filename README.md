# Miragon AI

[![Docker Hub](https://img.shields.io/docker/v/miragon/miragon-ai-server?style=flat-square&label=docker%20hub&logo=docker&logoColor=white&color=2496ED&sort=semver)](https://hub.docker.com/r/miragon/miragon-ai-server)
[![Docker Pulls](https://img.shields.io/docker/pulls/miragon/miragon-ai-server?style=flat-square&logo=docker&logoColor=white&color=2496ED)](https://hub.docker.com/r/miragon/miragon-ai-server)
[![Release](https://img.shields.io/github/v/release/Miragon/miragon-ai?style=flat-square&label=release)](https://github.com/Miragon/miragon-ai/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/Miragon/miragon-ai/ci.yml?style=flat-square&label=ci)](https://github.com/Miragon/miragon-ai/actions/workflows/ci.yml)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-blue?style=flat-square)](https://modelcontextprotocol.io/)

Drive **Camunda 7 / CIB Seven** from any AI assistant — process operations and analytics over the
[Model Context Protocol](https://modelcontextprotocol.io/).

One MCP server, two modules (**operations** + **analytics**), and a fleet of interactive
[MCP App](https://modelcontextprotocol.io/) widgets that render dashboards, BPMN diagrams and incident
panels straight into the chat. Built on [mcp-use](https://github.com/mcp-use/mcp-use).

> Ask _"why is the loan-approval process stalling?"_ — the assistant lists the running instances,
> opens the incident panel, reads the metrics, and offers to retry the failed jobs. No cockpit
> tab-hunting, no PromQL.

**[🐳 Pull the server image from Docker Hub →](https://hub.docker.com/r/miragon/miragon-ai-server)**

## What you get

- **Conversational BPM operations** — list and inspect process definitions, instances, user tasks,
  external tasks, incidents, jobs, deployments and history; start, modify, suspend, migrate, and
  resolve — exposed as `camunda7_*` tools.
- **Process analytics** — Prometheus-backed KPIs: performance, bottlenecks, failed instances,
  cluster / version / engine comparison, and a live engine-health snapshot, as `analytics_*` tools.
- **Interactive widgets (MCP Apps)** — cockpit dashboard, process & incident panels, BPMN viewer,
  heatmaps and history timeline rendered for the user while the model gets a compact summary.
- **Multi-engine routing** — talk to several CIB Seven instances at once with sticky per-session
  engine selection; analytics aggregate or compare across engines.
- **Toolset scoping** — narrow the surface to `read-only`, `operations`, or `admin` per deployment.
- **Self-hostable** — a single multi-arch (amd64/arm64) image on Docker Hub, plus a drop-in OTEL
  metrics plugin for the engine.

## Quick start

Pull the published server image and point an MCP client at it. You need a reachable CIB Seven /
Camunda 7 engine (REST API) and — for the analytics module — a Prometheus instance.

```bash
docker run --rm -p 8400:8400 \
  -e CAMUNDA_BASE_URL=http://host.docker.internal:8410/engine-rest \
  -e CAMUNDA_AUTH_TYPE=basic \
  -e CAMUNDA_USERNAME=demo \
  -e CAMUNDA_PASSWORD=demo \
  -e PROMETHEUS_URL=http://host.docker.internal:9090 \
  docker.io/miragon/miragon-ai-server:latest
```

The server speaks the streamable-HTTP MCP transport on `http://localhost:8400/mcp`. Add it to your
MCP host (Claude Desktop, Claude Code, ChatGPT, …) as an HTTP/streamable server.

**Prefer to build the image yourself?** You need a `GITHUB_TOKEN` (a PAT with `read:packages`, for
the private `@miragon/*` toolkit) passed as a BuildKit secret; then run `miragon-ai-server` in place
of the Docker Hub image above.

```bash
export GITHUB_TOKEN=ghp_xxx
docker build --secret id=github_token,env=GITHUB_TOKEN -t miragon-ai-server .
```

**Want the whole stack on your machine?** The repo ships a Compose file with CIB Seven, the OTEL
Collector, Prometheus and Grafana wired together — see
[`docker/`](docker/) and [Local development](#local-development) below.

## How it works

```
┌─────────────────────────────────────────────────────┐
│            MCP Host (Claude, ChatGPT, ...)          │
│  ┌──────────────────────────────────────────────┐   │
│  │              miragon-ai-server               │   │
│  │  ┌─────────────────┐  ┌──────────────────┐   │   │
│  │  │ camunda7 module │  │ analytics module │   │   │
│  │  │  BPM ops tools  │  │  analytics tools │   │   │
│  │  │  + widgets      │  │  + dashboards    │   │   │
│  │  └────────┬────────┘  └────────┬─────────┘   │   │
│  └───────────┼─────────────────────┼────────────┘   │
└──────────────┼─────────────────────┼────────────────┘
               ▼                     ▼
    ┌────────────────────┐ ┌─────────────────────┐
    │  OpenAPI Client    │ │  Prometheus Client  │
    │  (hey-api/openapi) │ │  (PromQL, HTTP API) │
    └──────────┬─────────┘ └──────────┬──────────┘
               ▼                      ▼
    ┌────────────────────┐ ┌─────────────────────┐
    │   CIB Seven /      │ │   Prometheus        │
    │   Camunda 7 REST   │ │  (process metrics)  │
    └────────────────────┘ └──────────┬──────────┘
                                      ▲
                          ┌───────────┴───────────┐
                          │  OTEL Collector       │
                          │  ◄── engine metrics   │
                          └───────────────────────┘
```

Operations tools call the engine's REST API directly. Analytics tools query Prometheus, which is fed
by the [engine metrics plugin](engine-plugins/) via the OpenTelemetry Collector — so analytics never
touch the engine database and stay model-bounded (definition keys, activity ids, engine ids only —
never instance ids or variable values).

## Modules & packages

A pnpm + Turbo monorepo. The gateway composes the two modules and serves them as one MCP endpoint.

| Path                                                      | Package                                   | Role                                                                    |
| --------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| [`apps/mcp-gateway/`](apps/mcp-gateway)                   | `@miragon-ai/mcp-gateway`                 | The MCP host: composes modules, bundles widgets, serves HTTP on `:8400` |
| [`packages/mcp-cibseven/`](packages/mcp-cibseven)         | `@miragon-ai/mcp-cibseven`                | Camunda 7 operations tools, widget tools, and React widgets             |
| [`packages/mcp-analytics/`](packages/mcp-analytics)       | `@miragon-ai/mcp-analytics`               | Prometheus-backed analytics tools and dashboard widgets                 |
| [`packages/client-cibseven/`](packages/client-cibseven)   | `@miragon-ai/client-cibseven`             | Generated CIB Seven REST SDK + MCP-oriented Zod schemas                 |
| [`packages/client-analytics/`](packages/client-analytics) | `@miragon-ai/client-analytics`            | Prometheus client, PromQL query functions + metrics contract            |
| [`packages/widget-shell/`](packages/widget-shell)         | `@miragon-ai/widget-shell`                | Shared widget plumbing (`adaptDataWidget`, view builders)               |
| [`engine-plugins/`](engine-plugins)                       | `ai.miragon.mcp:cibseven-history-metrics` | Kotlin OTEL metrics plugin for CIB Seven (Java 21)                      |
| [`docker/`](docker)                                       | —                                         | Compose stack: CIB Seven, OTEL Collector, Prometheus, Grafana           |
| [`examples/`](examples)                                   | —                                         | Federated upstream + a runnable CIB Seven showcase                      |
| [`docs/`](docs)                                           | `@miragon-ai/docs`                        | VitePress documentation site                                            |

## Tools

### Camunda 7 module — `camunda7_*`

BPM operations across these domains (`category`): `engines`, `process-definitions`,
`process-instances`, `tasks`, `external-tasks`, `messages-signals`, `deployments`, `incidents`,
`jobs`, `history`, `migrations`. Highlights:

- **Process definitions** — `list_process_definitions`, `get_process_definition_xml`
- **Process instances** — `start`, `list`, `get`, `delete`, `modify`, `set_*_suspension`,
  `get_activity_instance_tree`, variables
- **User & external tasks** — `list/get/claim/unclaim/complete`, `fetch_and_lock`,
  `complete_external_task`, `handle_external_task_failure`
- **Incidents & jobs** — `list_incidents`, `resolve_incident`, `format_incident_issue`,
  `list_jobs`, `set_job_retries`
- **History & migrations** — `query_historic_*`, migration tools
- **Widgets** — `show_cockpit_dashboard`, `show_process_list`/`detail`, `show_incidents_dashboard`,
  `show_bpmn_viewer`, `show_history_timeline`, `show_job_panel`, …

### Analytics module — `analytics_*`

Prometheus-backed analysis over PromQL: `analyze_process_performance`, `compare_execution_periods`,
`element_bottleneck`, `find_failed_instances`, `cluster_compare`, `version_compare`,
`engine_compare`, and `engine_health` (a live WIP / incidents / backlog / alerts snapshot). Widgets:
`show_dashboard`, `show_failure_dashboard`, `show_cluster_compare`, `show_version_compare`,
`show_engine_compare`, `show_bpmn_heatmap`.

### Toolsets

Narrow the camunda7 surface per deployment via a suffix in `MCP_ACTIVE_MODULES`:

| Toolset               | Surface                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `camunda7:read-only`  | Queries only (`list_*`, `get_*`, `query_*`) plus engine selection — monitoring without writes                   |
| `camunda7:operations` | Read-only plus day-to-day writes (start instances, complete/claim tasks, variables, retries, messages, signals) |
| `camunda7:admin`      | Everything, including delete/modify/suspend, deployments, migrations                                            |

Example: `MCP_ACTIVE_MODULES=camunda7:read-only,analytics`.

## Configuration

The most common variables — see [`docs/operations.md`](docs/operations.md) for the full reference.

| Variable                                                  | Default                             | Description                                                                           |
| --------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                                                    | `8400`                              | HTTP port the MCP server listens on                                                   |
| `MCP_ACTIVE_MODULES`                                      | all                                 | Comma-separated modules (`camunda7,analytics`), each with an optional toolset suffix  |
| `MCP_OAUTH`                                               | —                                   | JSON OAuth resource-server config (Keycloak / Auth0 / generic OIDC) protecting `/mcp` |
| `CAMUNDA_BASE_URL`                                        | `http://localhost:8410/engine-rest` | Single-engine REST base URL                                                           |
| `CAMUNDA_ENGINES_JSON` / `CAMUNDA_ENGINES_FILE`           | —                                   | Register multiple engines (see [Multi-engine](#multi-engine))                         |
| `CAMUNDA_COCKPIT_URL`                                     | derived                             | Cockpit web base for jump-out links                                                   |
| `CAMUNDA_AUTH_TYPE`                                       | `none`                              | `basic`, `bearer`, `passthrough`, or `none` — fallback for engines without an `auth`  |
| `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` / `CAMUNDA_TOKEN` | —                                   | Credentials for `basic`/`bearer`; `passthrough` forwards each caller's bearer token   |
| `PROMETHEUS_URL`                                          | `http://localhost:9090`             | Prometheus HTTP API — the analytics data source                                       |

### Multi-engine

The server can route to several CIB Seven instances. Tag each engine in its metrics plugin
(`ENGINE_ID`), register them in the server (`CAMUNDA_ENGINES_JSON` / `CAMUNDA_ENGINES_FILE` —
`ENGINE_ID` must match the registered `id`, or that engine's analytics come back empty), and the
host picks one per session via the `camunda7_engine` tool (`list` / `select` / `current`). Every
operations tool also accepts a per-call `engine` override. Analytics tools take an optional `engine`
filter to aggregate or compare. Each engine entry may carry its own `auth`
(`{type, username?, password?, token?}`); entries without one use the global `CAMUNDA_*` settings.
Full walkthrough in [`docs/operations.md`](docs/operations.md).

## Engine metrics plugin

The analytics module needs `camunda_*` series in Prometheus. The Kotlin plugin in
[`engine-plugins/`](engine-plugins) emits them as OpenTelemetry instruments from inside the CIB Seven
runtime — no engine-side database. It publishes to GitHub Packages Maven as
`ai.miragon.mcp:cibseven-history-metrics`. See [`engine-plugins/README.md`](engine-plugins/README.md)
and the runnable [`examples/cibseven-example/`](examples/cibseven-example).

## Local development

Run the full stack — infra in Docker, the server from source with hot reload.

```bash
export GITHUB_TOKEN=ghp_xxx           # PAT with read:packages — the @miragon/* toolkit is private
pnpm install --frozen-lockfile

docker compose -f docker/docker-compose.yml up -d   # CIB Seven, OTEL, Prometheus, Grafana
cp .env.example .env                                 # dev defaults: engine on :8410, Prometheus on :8460
pnpm dev                                             # miravelo example upstream + gateway on :8400
```

`pnpm dev` also serves the `mcp-use` inspector at `http://localhost:8400/inspector` — call tools and
render widgets by hand. The minimum bar for any change:

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
cd engine-plugins && ./gradlew build      # Kotlin: compile + unit + Konsist architecture tests
```

See [`docs/developer.md`](docs/developer.md) and [`CLAUDE.md`](CLAUDE.md) for the architecture
invariants and house patterns.

## Documentation

- [Architecture](docs/architecture.md) — one-page mental model of the server, modules and systems
- [For Developers](docs/developer.md) — clone, install, and run the stack locally
- [Operations](docs/operations.md) — deployment, environment, and observability
- [Usage](docs/usage.md) — connect an assistant and operate your processes

Build the site locally with `pnpm docs:dev`.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please): semantic
commits on `main` open a Release PR; merging it tags the repo and publishes the
[server image](https://hub.docker.com/r/miragon/miragon-ai-server) to Docker Hub and the engine
plugin to GitHub Packages Maven.

## Contributing

Issues, pull requests and discussions are welcome on
[GitHub](https://github.com/Miragon/miragon-ai). Use [semantic commit messages](https://www.conventionalcommits.org/)
(they drive the release), and make sure `pnpm build && pnpm typecheck && pnpm test && pnpm lint`
passes. The repo-specific skills under `.claude/skills/` document the two main feature paths.

## License

See [LICENSE](LICENSE).
