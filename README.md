# Automation MCP

A single MCP server that exposes Camunda 7 / CIB Seven BPM operations and a Prometheus-backed process analytics module through the [Model Context Protocol](https://modelcontextprotocol.io/). Built on [mcp-use](https://github.com/mcp-use/mcp-use) with OpenAPI-generated clients and interactive MCP App widgets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            MCP Host (Claude, ChatGPT, ...)          │
│  ┌──────────────────────────────────────────────┐   │
│  │         @miragon-ai/mcp-gateway          │   │
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

## Layout

| Path                          | Description                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/mcp-gateway/`           | `@miragon-ai/mcp-gateway` — mcp-use MCP server with HTTP transport and widget HTML bundle |
| `packages/client-cibseven/`   | `@miragon-ai/client-cibseven` — OpenAPI-generated TypeScript client (hey-api)             |
| `packages/mcp-cibseven/`      | `@miragon-ai/mcp-cibseven` — BPM tools + React widgets                                    |
| `packages/client-analytics/`  | `@miragon-ai/client-analytics` — Prometheus PromQL query helpers                          |
| `packages/mcp-analytics/`     | `@miragon-ai/mcp-analytics` — Prometheus analytics tools + dashboard widgets              |
| `packages/widget-shell/`      | `@miragon-ai/widget-shell` — shared widget primitives + adapt-data wrapper                |
| `engine-plugins/`             | Kotlin OTEL plugins for CIB Seven: process-metrics emitter + trace event-bridge (Java 21) |
| `examples/miravelo-upstream/` | Mock CRM/leasing upstream that federates a manifest into the gateway                      |
| `examples/cibseven-example/`  | Runnable Spring Boot showcase that consumes the engine-plugins (composite Gradle build)   |
| `docker/`                     | docker-compose for CIB Seven + OTEL Collector + Prometheus + Grafana                      |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Java 21 (for the Kotlin plugins — `engine-plugins/.java-version` pins this version)
- [jenv](https://www.jenv.be/) — manages the Java version via `engine-plugins/.java-version` (Java 21)
- Docker (for CIB Seven + OTEL Collector + Prometheus)
- A GitHub PAT with `read:packages` scope (the `@miragon/mcp-toolkit-*` packages are published to the private Miragon GitHub Packages registry)

## Setup

**1. Authenticate to GitHub Packages**

The `@miragon/mcp-toolkit-*` packages live in a private Miragon registry on `npm.pkg.github.com`. The repo's `.npmrc` reads the token from `${GITHUB_TOKEN}` — you supply it via env var.

1. Mint a classic PAT at https://github.com/settings/tokens with the **`read:packages`** scope only (long expiry recommended).
2. If Miragon enforces SSO on your account, click **Configure SSO** on the token and authorize it for the `Miragon` org — otherwise installs fail with `403 Forbidden`.
3. Export it in the shell that runs `pnpm` (add to `~/.zshrc` or your secret manager):

```bash
export GITHUB_TOKEN=ghp_xxx
```

If you don't have access, contact a Miragon team member.

**2. Set the Java version**

Install [jenv](https://www.jenv.be/) and add Java 21. The `engine-plugins/.java-version` file pins the version automatically when you enter the directory:

```bash
jenv add <path-to-java-21>   # e.g. $(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
```

**3. Build the Kotlin plugins**

Always use the `./gradlew` wrapper — not a globally installed `gradle`. The wrapper ensures the correct Gradle version is used; a global installation may differ and cause build failures.

```bash
cd engine-plugins && ./gradlew clean build && cd ..
```

**4. Start the infrastructure**

The default compose stack starts only the infra (CIB Seven, OTEL Collector, Prometheus, Grafana, Jaeger) — the Node MCP server is left out so you can run it locally via `pnpm dev` on port 8400 without a port conflict.

```bash
cd docker && docker compose up -d && cd ..
```

To bring up the bundled MCP server in a container too (single-shot deploy, no local dev), enable the `full` profile:

```bash
cd docker && docker compose --profile full up -d && cd ..
```

## Build

```bash
pnpm install
pnpm -F @miragon-ai/client-cibseven generate  # only after spec changes
pnpm build
```

The build chain is:

1. `@miragon-ai/client-cibseven` — `tsc` against the generated SDK
2. `@miragon-ai/core`, `@miragon-ai/ui` — shared helpers and UI primitives
3. `@miragon-ai/mcp-cibseven`, `@miragon-ai/mcp-analytics` — tool + widget modules
4. `@miragon-ai/mcp-gateway` — Vite bundles `mcp-app.html` (single-file HTML with all widgets) and `tsc` compiles the gateway

## Run

```bash
cd docker && docker compose up -d
cd ..

PORT=8400 \
CAMUNDA_BASE_URL=http://localhost:8410/engine-rest \
CAMUNDA_AUTH_TYPE=basic \
CAMUNDA_USERNAME=demo \
CAMUNDA_PASSWORD=demo \
PROMETHEUS_URL=http://localhost:8460 \
pnpm -F @miragon-ai/mcp-gateway start
```

The server listens on `http://0.0.0.0:${PORT}` (HTTP transport). Point an MCP client at it.

## Environment

| Variable                      | Default                             | Description                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                        | `8400`                              | HTTP port the MCP server listens on                                                                                                                                                                                                                                                               |
| `MCP_ACTIVE_MODULES`          | all                                 | Comma-separated module list (`camunda7,analytics`). Each module optionally takes a toolset suffix, e.g. `camunda7:read-only` — see "Toolsets" below.                                                                                                                                              |
| `CAMUNDA_ENGINES_FILE`        | —                                   | Path to a JSON file containing the engine list `[{id, baseUrl, cockpitUrl?}, ...]`. Preferred at scale (ConfigMap workflows).                                                                                                                                                                     |
| `CAMUNDA_ENGINES_JSON`        | —                                   | Inline JSON array of `{id, baseUrl, cockpitUrl?}` — see "Multi-engine setup" below. Takes precedence over `CAMUNDA_BASE_URL`; ignored when `CAMUNDA_ENGINES_FILE` is set.                                                                                                                         |
| `CAMUNDA_BASE_URL`            | `http://localhost:8410/engine-rest` | Single-engine back-compat. When set without `CAMUNDA_ENGINES_*`, synthesized into a one-entry registry with id `default`.                                                                                                                                                                         |
| `CAMUNDA_COCKPIT_URL`         | _derived from `CAMUNDA_BASE_URL`_   | Cockpit web UI base, e.g. `http://localhost:8410/webapp`. Used for jump-out links: `<base>/#/seven/auth/process/<key>/<version>?tab=incidents` (process) and `<base>/#/seven/auth/process/<key>/<version>/<instanceId>?tab=variables` (instance). For multi-engine, pass per-engine `cockpitUrl`. |
| `CAMUNDA_AUTH_TYPE`           | `none`                              | `basic`, `bearer`, or `none`. Same auth applies to every engine in the registry.                                                                                                                                                                                                                  |
| `CAMUNDA_USERNAME`            | —                                   | Basic auth username                                                                                                                                                                                                                                                                               |
| `CAMUNDA_PASSWORD`            | —                                   | Basic auth password                                                                                                                                                                                                                                                                               |
| `CAMUNDA_TOKEN`               | —                                   | Bearer token                                                                                                                                                                                                                                                                                      |
| `CAMUNDA_INCIDENT_ISSUE_REPO` | —                                   | Optional GitHub convenience for the `camunda7_format_incident_issue` tool and `draft_incident_ticket` prompt: enables a prefilled new-issue URL and a default target when the user asks to file on GitHub. The ticket draft itself is tracker-agnostic and is never filed by this server.         |
| `PROMETHEUS_URL`              | `http://localhost:9090`             | Prometheus HTTP API — the analytics module's data source (PromQL). The Compose stack maps it to host port `8460`.                                                                                                                                                                                 |
| `ENGINE_ID`                   | `default`                           | _(Engine plugin)_ Stable identifier the CIB Seven metrics plugin attaches as the `engine_id` label on every metric, so analytics can attribute and compare data across engines. Set per CIB Seven instance.                                                                                       |
| `METRICS_ENABLED`             | `true`                              | _(Engine plugin)_ Toggle the OTEL process-metrics emitter inside the CIB Seven runtime.                                                                                                                                                                                                           |

## Multi-engine setup

The MCP server can talk to several CIB Seven instances at once. Operations tools (`camunda7_*`) are routed per MCP session via a **sticky engine selection**; analytics tools (`analytics_*`) stay session-independent and accept an optional `engine` filter (single id or a list) so a single dashboard can aggregate or compare engines.

**1. Tag every engine.** In each CIB Seven app that ships the metrics plugin, set `ENGINE_ID` to a stable id (e.g. `prod-a`, `prod-b`). The plugin attaches that id as the `engine_id` label on every emitted metric.

**2. Register the engines in the MCP server.** Either as an inline JSON env (good for local dev):

```bash
CAMUNDA_ENGINES_JSON='[
  {"id":"prod-a","baseUrl":"http://localhost:8410/engine-rest","cockpitUrl":"http://localhost:8410/webapp"},
  {"id":"prod-b","baseUrl":"http://localhost:8411/engine-rest","cockpitUrl":"http://localhost:8411/webapp"}
]'
```

…or as a file path (preferred at scale, fits ConfigMap workflows):

```bash
CAMUNDA_ENGINES_FILE=/etc/automation-mcp/engines.json
```

`CAMUNDA_AUTH_TYPE` / `CAMUNDA_USERNAME` / `CAMUNDA_PASSWORD` / `CAMUNDA_TOKEN` still apply globally — same auth across all engines.

**3. Pick an engine per MCP session.** The LLM client discovers and picks engines via the `camunda7_engine` tool:

- `camunda7_engine({action: "list"})` — returns the registry plus the current selection.
- `camunda7_engine({action: "select", engineId: "prod-a"})` — sets the sticky engine for this session.
- `camunda7_engine({action: "current"})` — reports the current selection.

When more than one engine is configured, the first operations tool call without a prior selection returns a structured error `{code: "ENGINE_NOT_SELECTED", availableEngines: [...]}` — the host typically reacts by selecting an engine and retrying the original call. With only one engine configured (or the legacy `CAMUNDA_BASE_URL` path), the selection is implicit and no selection is needed.

Every operations tool also takes an optional `engine` parameter that overrides the session pick for a single call without changing the sticky selection.

**4. Local dev — bring up two engines.** The docker compose stack ships a `multi-engine` profile that adds a second CIB Seven on port 8411:

```bash
cd docker && docker compose --profile multi-engine up -d
```

Both engines emit metrics tagged `engine_id = 'prod-a'` and `'prod-b'` into the shared Prometheus. Start the MCP server with both registered:

```bash
CAMUNDA_ENGINES_JSON='[
  {"id":"prod-a","baseUrl":"http://localhost:8410/engine-rest","cockpitUrl":"http://localhost:8410/webapp"},
  {"id":"prod-b","baseUrl":"http://localhost:8411/engine-rest","cockpitUrl":"http://localhost:8411/webapp"}
]' \
CAMUNDA_AUTH_TYPE=basic CAMUNDA_USERNAME=demo CAMUNDA_PASSWORD=demo \
PROMETHEUS_URL=http://localhost:8460 \
pnpm -F @miragon-ai/mcp-gateway start
```

## Tools

### Camunda7 module (BPM operations tools + widgets)

All tools are prefixed with `camunda7_` and carry a `category` matching their domain (`engines`, `process-definitions`, `process-instances`, `tasks`, `external-tasks`, `messages-signals`, `deployments`, `incidents`, `jobs`, `history`, `migrations`):

- Engine selection: `engine` (actions `list` / `select` / `current`) — required when more than one engine is configured (see "Multi-engine setup" above).
- Process definitions: `list_process_definitions`, `get_process_definition_xml`
- Process instances: `start_process_instance`, `list_process_instances`, `get_process_instance`, `delete_process_instance`, `modify_process_instance`, `set_process_instance_suspension`, `get_activity_instance_tree`, `get_process_instance_variables`, `set_process_instance_variable`
- User tasks: `list_tasks`, `get_task`, `claim_task`, `unclaim_task`, `complete_task`, `set_task_assignee`, `get_task_variables`
- External tasks: `fetch_and_lock`, `complete_external_task`, `handle_external_task_failure`
- Messages / signals: `correlate_message`, `throw_signal`
- Deployments: `list_deployments`, `create_deployment`
- Incidents: `list_incidents`, `resolve_incident`, `format_incident_issue` (build a tracker-agnostic ticket draft — presented in the chat for review; the user decides where to file it via whatever integration the host exposes. The `draft_incident_ticket` prompt walks the agent through it)
- Jobs: `list_jobs`, `set_job_retries`
- History: `query_historic_process_instances`, `query_historic_activity_instances`, `query_historic_task_instances`, `query_historic_variable_instances`
- Widget tools (return data + render an MCP App): `open_cockpit`, `show_cockpit_dashboard`, `show_process_list`, `show_process_detail`, `show_process_instances`, `show_instance_detail`, `show_incidents_dashboard`, `show_process_incidents`, `show_incident_detail`, `show_history_timeline`, `show_bpmn_viewer`, `show_job_panel` — each cockpit view is additionally backed by a data-only `*_data` feed tool that the widgets call for in-widget refreshes

#### Toolsets

A deployment can narrow the camunda7 tool surface to its use case via a toolset suffix in `MCP_ACTIVE_MODULES`:

| Toolset               | Surface                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `camunda7:read-only`  | Queries only (`list_*`, `get_*`, `query_*`, `format_incident_issue`) plus the `engine` selection tool — monitoring without write access                 |
| `camunda7:operations` | Read-only plus day-to-day engine writes: `start_process_instance`, `complete_task`, `claim_task`, variables, `set_job_retries`, messages, signals       |
| `camunda7:admin`      | Everything, additionally `delete_/modify_process_instance`, `set_process_instance_suspension`, `create_deployment`, migrations, `set_job_retries_batch` |

Without a suffix all tools are exposed (unchanged default); an unknown toolset logs a warning and falls back to all tools. The filtering rule lives in `packages/mcp-cibseven/src/lib/toolsets.ts`. Widget tools and `*_data` feeds are read-only views and are not filtered.

### Analytics module (analytics tools + dashboards)

All tools are prefixed with `analytics_` (category `analytics`) and query Prometheus over PromQL:

- `analyze_process_performance`, `compare_execution_periods`
- `element_bottleneck`, `find_failed_instances`
- `cluster_compare`, `version_compare`, `engine_compare`
- `engine_health` — live ops snapshot (running WIP, open incidents, dead jobs, job/task backlog, firing/pending alerts)
- Widget tools: `show_dashboard`, `show_failure_dashboard`, `show_cluster_compare`, `show_version_compare`, `show_engine_compare`, `show_bpmn_heatmap`

Per-instance drill-down (search by variable, single-instance traces) is not
metric-backed — use the `camunda7_query_historic_*` tools and the Jaeger UI.
CIB Seven operational alert rules live in `docker/prometheus/alerts.yml`.

## Widget UI

`apps/mcp-gateway/mcp-app.html` is a single-file HTML bundle produced by Vite + `vite-plugin-singlefile`. It contains React, Tailwind, and all widget components. The gateway exposes it as the MCP resource `ui://automation-mcp/mcp-app.html`. Widget tools return `{ widget, data }` in their structured content; the `McpAppView` component dispatches to the matching widget from the shared registry.

## Deployment

A multi-stage `Dockerfile` builds the server with pruned production deps and exposes port 8400. See `Dockerfile` in the repo root.

## Troubleshooting

### Docker image is stale after code changes

`docker compose up -d` reuses existing images. `docker compose down -v` removes containers and volumes but **not images**. After changing anything that affects the build (Dockerfile, `package.json`, `tsconfig.json`, source code), force a clean rebuild — pass `--profile full` if you also want the bundled MCP server image rebuilt:

```bash
docker compose -f docker/docker-compose.yml --profile full down -v
docker compose -f docker/docker-compose.yml --profile full build --no-cache
docker compose -f docker/docker-compose.yml --profile full up -d
```

`--no-cache` also bypasses the persistent BuildKit cache mounts (`pnpm-store`, `turbo-server`) that survive `down -v`.

## License

See [LICENSE](LICENSE) for details.
