# Automation MCP

A single MCP server that exposes Camunda 7 / CIB Seven BPM operations and a ClickHouse-backed process analytics module through the [Model Context Protocol](https://modelcontextprotocol.io/). Built on [mcp-use](https://github.com/mcp-use/mcp-use) with OpenAPI-generated clients and interactive MCP App widgets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            MCP Host (Claude, ChatGPT, ...)          │
│  ┌──────────────────────────────────────────────┐   │
│  │         @miragon-ai/mcp-gateway          │   │
│  │  ┌─────────────────┐  ┌──────────────────┐   │   │
│  │  │ camunda7 module │  │ analytics module │   │   │
│  │  │  37 tools       │  │   6 tools        │   │   │
│  │  │  + 5 widgets    │  │   + 1 widget     │   │   │
│  │  └────────┬────────┘  └────────┬─────────┘   │   │
│  └───────────┼─────────────────────┼────────────┘   │
└──────────────┼─────────────────────┼────────────────┘
               ▼                     ▼
    ┌────────────────────┐ ┌─────────────────────┐
    │  OpenAPI Client    │ │  ClickHouse Client  │
    │  (hey-api/openapi) │ │  (hand-written)     │
    └──────────┬─────────┘ └──────────┬──────────┘
               ▼                      ▼
    ┌────────────────────┐ ┌─────────────────────┐
    │   CIB Seven /      │ │   ClickHouse        │
    │   Camunda 7 REST   │ │   (Camunda History) │
    └────────────────────┘ └─────────────────────┘
```

## Layout

| Path                          | Description                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/mcp-gateway/`           | `@miragon-ai/mcp-gateway` — mcp-use MCP server with HTTP transport and widget HTML bundle |
| `packages/client-cibseven/`   | `@miragon-ai/client-cibseven` — OpenAPI-generated TypeScript client (hey-api)             |
| `packages/mcp-cibseven/`      | `@miragon-ai/mcp-cibseven` — BPM tools + React widgets                                    |
| `packages/client-analytics/`  | `@miragon-ai/client-analytics` — ClickHouse query helpers                                 |
| `packages/mcp-analytics/`     | `@miragon-ai/mcp-analytics` — ClickHouse analytics tools + dashboard widget               |
| `packages/widget-shell/`      | `@miragon-ai/widget-shell` — shared widget primitives + adapt-data wrapper                |
| `engine-plugins/`             | Kotlin OTEL / ClickHouse sync plugins for CIB Seven (separate Gradle build, Java 21)      |
| `examples/miravelo-upstream/` | Mock CRM/leasing upstream that federates a manifest into the gateway                      |
| `examples/cibseven-example/`  | Runnable Spring Boot showcase that consumes the engine-plugins (composite Gradle build)   |
| `docker/`                     | docker-compose for CIB Seven + ClickHouse + OTEL                                          |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Java 21 (for the Kotlin plugins — `engine-plugins/.java-version` pins this version)
- [jenv](https://www.jenv.be/) — manages the Java version via `engine-plugins/.java-version` (Java 21)
- Docker (for CIB Seven + ClickHouse)
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

The default compose stack starts only the infra (CIB Seven, ClickHouse, OTEL collector, Jaeger) — the Node MCP server is left out so you can run it locally via `pnpm dev` on port 8400 without a port conflict.

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
CLICKHOUSE_URL=http://localhost:8420 \
CLICKHOUSE_USERNAME=camunda \
CLICKHOUSE_PASSWORD=camunda123 \
CLICKHOUSE_DATABASE=camunda_history \
pnpm -F @miragon-ai/mcp-gateway start
```

The server listens on `http://0.0.0.0:${PORT}` (HTTP transport). Point an MCP client at it.

## Environment

| Variable                      | Default                             | Description                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                        | `8400`                              | HTTP port the MCP server listens on                                                                                                                                                                                                                                                              |
| `MCP_ACTIVE_MODULES`          | all                                 | Comma-separated module list (`camunda7,analytics`)                                                                                                                                                                                                                                               |
| `CAMUNDA_BASE_URL`            | `http://localhost:8410/engine-rest` | Engine REST API base URL                                                                                                                                                                                                                                                                         |
| `CAMUNDA_COCKPIT_URL`         | _derived from `CAMUNDA_BASE_URL`_   | Cockpit web UI base, e.g. `http://localhost:8410/webapp`. Used for jump-out links: `<base>/#/seven/auth/process/<key>/<version>?tab=incidents` (process) and `<base>/#/seven/auth/process/<key>/<version>/<instanceId>?tab=variables` (instance).                                                |
| `CAMUNDA_AUTH_TYPE`           | `none`                              | `basic`, `bearer`, or `none`                                                                                                                                                                                                                                                                     |
| `CAMUNDA_USERNAME`            | —                                   | Basic auth username                                                                                                                                                                                                                                                                              |
| `CAMUNDA_PASSWORD`            | —                                   | Basic auth password                                                                                                                                                                                                                                                                              |
| `CAMUNDA_TOKEN`               | —                                   | Bearer token                                                                                                                                                                                                                                                                                     |
| `CAMUNDA_INCIDENT_ISSUE_REPO` | —                                   | Default `owner/repo` for the `camunda7_format_incident_issue` tool and `report_incident_to_github` prompt. Per-call override stays available. Requires the [official GitHub MCP server](https://github.com/github/github-mcp-server) installed alongside this server to actually file the issue. |
| `CLICKHOUSE_URL`              | `http://localhost:8420`             | ClickHouse HTTP endpoint                                                                                                                                                                                                                                                                         |
| `CLICKHOUSE_USERNAME`         | `default`                           | ClickHouse user                                                                                                                                                                                                                                                                                  |
| `CLICKHOUSE_PASSWORD`         | ``                                  | ClickHouse password                                                                                                                                                                                                                                                                              |
| `CLICKHOUSE_DATABASE`         | `camunda_history`                   | ClickHouse database                                                                                                                                                                                                                                                                              |

## Tools

### Camunda7 module (37 + 5 widget tools)

All tools are prefixed with `camunda7_`:

- Process definitions: `list_process_definitions`, `get_process_definition_xml`
- Process instances: `start_process_instance`, `list_process_instances`, `get_process_instance`, `delete_process_instance`, `modify_process_instance`, `get_activity_instance_tree`, `get_process_instance_variables`, `set_process_instance_variable`
- User tasks: `list_tasks`, `get_task`, `claim_task`, `unclaim_task`, `complete_task`, `set_task_assignee`, `get_task_variables`
- External tasks: `fetch_and_lock`, `complete_external_task`, `handle_external_task_failure`
- Messages / signals: `correlate_message`, `throw_signal`
- Deployments: `list_deployments`, `create_deployment`
- Incidents: `list_incidents`, `resolve_incident`, `format_incident_issue` (build a GitHub-issue payload — pair with the official GitHub MCP server's `create_issue` tool, or use the `report_incident_to_github` prompt to chain both in one step)
- Jobs: `list_jobs`, `set_job_retries`
- History: `query_historic_process_instances`, `query_historic_activity_instances`, `query_historic_task_instances`, `query_historic_variable_instances`
- Widget tools (return data + render an MCP App): `show_process_list`, `show_task_dashboard`, `show_instance_detail`, `show_incidents_dashboard`, `show_process_incidents`, `show_history_timeline`

### Analytics module (6 + 1 widget tool)

All tools are prefixed with `analytics_`:

- `search_process_instances`, `search_by_variable`
- `analyze_process_performance`, `compare_execution_periods`
- `find_failed_instances`, `trace_process_execution`
- Widget tool: `show_dashboard`

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
