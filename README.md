# Automation MCP

A single MCP server that exposes Camunda 7 / CIB Seven BPM operations and a ClickHouse-backed process analytics module through the [Model Context Protocol](https://modelcontextprotocol.io/). Built on [mcp-use](https://github.com/mcp-use/mcp-use) with OpenAPI-generated clients and interactive MCP App widgets.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            MCP Host (Claude, ChatGPT, ...)          │
│  ┌──────────────────────────────────────────────┐   │
│  │         @automation-mcp/server               │   │
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

| Path | Description |
|------|-------------|
| `server/` | `@automation-mcp/server` — mcp-use MCP server with HTTP transport and widget HTML bundle |
| `modules/camunda7/client/` | `@automation-mcp/client-camunda7` — OpenAPI-generated TypeScript client (hey-api) |
| `modules/camunda7/mcp/` | `@automation-mcp/mcp-camunda7` — BPM tools + React widgets |
| `modules/analytics/mcp/` | `@automation-mcp/mcp-analytics` — ClickHouse analytics tools + dashboard widget |
| `packages/core/` | `@automation-mcp/core` — `ModulePlugin` interface + `createToolRegistrar` helper |
| `packages/ui/` | `@automation-mcp/ui` — shared shadcn primitives + tailwind globals |
| `plugins/` | Kotlin OTEL / ClickHouse sync plugins (unchanged) |
| `docker/` | docker-compose for CIB Seven + ClickHouse + OTEL |
| `cibseve-open-api-doc.json` | Source spec used by the client codegen |

## Prerequisites

- Node.js 22+
- pnpm 10+
- Java 21 (for the Kotlin plugins — `plugins/.java-version` pins this version)
- [jenv](https://www.jenv.be/) (recommended, to auto-switch Java versions)
- Docker (for CIB Seven + ClickHouse)
- Git submodule access to `vendor/mcp-toolkit` (private Miragon repo)

## Setup

**1. Initialize the git submodule**

`vendor/mcp-toolkit` is a private Miragon submodule. Initialize it before anything else:

```bash
git submodule update --init --recursive
```

If you don't have access, contact a Miragon team member.

**2. Build the Kotlin plugins**

The `plugins/` directory contains a `.java-version` file (Java 21). If you have [jenv](https://www.jenv.be/) installed, it will automatically switch to the correct Java version when you enter that directory. Without the right JDK active, `./gradlew` will fail.

```bash
cd plugins && ./gradlew clean build && cd ..
```

> **Tip:** Install jenv and add Java 21 to it (`jenv add <path-to-jdk-21>`) so the version is picked up automatically.

**3. Start the infrastructure**

```bash
cd docker && docker compose up -d && cd ..
```

## Build

```bash
pnpm install
pnpm -F @automation-mcp/client-camunda7 generate  # only after spec changes
pnpm build
```

The build chain is:

1. `@automation-mcp/client-camunda7` — `tsc` against the generated SDK
2. `@automation-mcp/core`, `@automation-mcp/ui` — shared helpers and UI primitives
3. `@automation-mcp/mcp-camunda7`, `@automation-mcp/mcp-analytics` — tool + widget modules
4. `@automation-mcp/server` — Vite bundles `mcp-app.html` (single-file HTML with all widgets) and `tsc` compiles the server

## Run

```bash
cd docker && docker compose up -d cibseven clickhouse
cd ..

PORT=3010 \
CAMUNDA_BASE_URL=http://localhost:8080/engine-rest \
CAMUNDA_AUTH_TYPE=basic \
CAMUNDA_USERNAME=demo \
CAMUNDA_PASSWORD=demo \
CLICKHOUSE_URL=http://localhost:8123 \
CLICKHOUSE_USERNAME=camunda \
CLICKHOUSE_PASSWORD=camunda123 \
CLICKHOUSE_DATABASE=camunda_history \
pnpm -F @automation-mcp/server start
```

The server listens on `http://0.0.0.0:${PORT}` (HTTP transport). Point an MCP client at it.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3010` | HTTP port the MCP server listens on |
| `MCP_ACTIVE_MODULES` | all | Comma-separated module list (`camunda7,analytics`) |
| `CAMUNDA_BASE_URL` | `http://localhost:8080/engine-rest` | Engine REST API base URL |
| `CAMUNDA_AUTH_TYPE` | `none` | `basic`, `bearer`, or `none` |
| `CAMUNDA_USERNAME` | — | Basic auth username |
| `CAMUNDA_PASSWORD` | — | Basic auth password |
| `CAMUNDA_TOKEN` | — | Bearer token |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USERNAME` | `default` | ClickHouse user |
| `CLICKHOUSE_PASSWORD` | `` | ClickHouse password |
| `CLICKHOUSE_DATABASE` | `camunda_history` | ClickHouse database |

## Tools

### Camunda7 module (37 + 5 widget tools)

All tools are prefixed with `camunda7_`:

- Process definitions: `list_process_definitions`, `get_process_definition_xml`
- Process instances: `start_process_instance`, `list_process_instances`, `get_process_instance`, `delete_process_instance`, `modify_process_instance`, `get_activity_instance_tree`, `get_process_instance_variables`, `set_process_instance_variable`
- User tasks: `list_tasks`, `get_task`, `claim_task`, `unclaim_task`, `complete_task`, `set_task_assignee`, `get_task_variables`
- External tasks: `fetch_and_lock`, `complete_external_task`, `handle_external_task_failure`
- Messages / signals: `correlate_message`, `throw_signal`
- Deployments: `list_deployments`, `create_deployment`
- Incidents: `list_incidents`, `resolve_incident`
- Jobs: `list_jobs`, `set_job_retries`
- History: `query_historic_process_instances`, `query_historic_activity_instances`, `query_historic_task_instances`, `query_historic_variable_instances`
- Widget tools (return data + render an MCP App): `show_process_list`, `show_task_dashboard`, `show_instance_detail`, `show_incident_panel`, `show_history_timeline`

### Analytics module (6 + 1 widget tool)

All tools are prefixed with `analytics_`:

- `search_process_instances`, `search_by_variable`
- `analyze_process_performance`, `compare_execution_periods`
- `find_failed_instances`, `trace_process_execution`
- Widget tool: `show_dashboard`

## Widget UI

`server/mcp-app.html` is a single-file HTML bundle produced by Vite + `vite-plugin-singlefile`. It contains React, Tailwind, and all widget components. The server exposes it as the MCP resource `ui://automation-mcp/mcp-app.html`. Widget tools return `{ widget, data }` in their structured content; the `McpAppView` component dispatches to the matching widget from the shared registry.

## Deployment

A multi-stage `Dockerfile` builds the server with pruned production deps and exposes port 3010. See `Dockerfile` in the repo root.

## License

See [LICENSE](LICENSE) for details.
