# Architecture

The platform is a single Node.js MCP server that exposes Camunda 7 / CIB Seven
operations and ClickHouse-backed analytics to any MCP host (Claude, ChatGPT, …).
A separate Kotlin pipeline streams the engine's history into ClickHouse so the
analytics module can query it.

## At a glance

```mermaid
flowchart LR
  Host[MCP Host<br/>Claude · ChatGPT] -->|MCP / HTTP| Server[MCP Gateway<br/>:8400]

  subgraph Modules
    Cibseven[cibseven<br/>tools + widgets]
    Analytics[analytics<br/>tools + widgets]
  end

  Server --> Cibseven
  Server --> Analytics

  Cibseven -->|REST| Engine[(Camunda 7 / CIB Seven)]
  Analytics -->|SQL| CH[(ClickHouse)]

  Engine -. history events .-> Plugins[Kotlin history plugins]
  Plugins --> CH

  Server -. serves .-> Widgets[Widget bundle<br/>React + Tailwind]
```

## Modules

| Module                                        | Role                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP Gateway** (`apps/mcp-gateway/`)         | Hosts the HTTP transport on port `8400`, loads modules from `MCP_ACTIVE_MODULES`, and serves a single-file React widget bundle.                          |
| **cibseven** (`packages/mcp-cibseven/`)       | Wraps the Camunda 7 / CIB Seven REST API via an OpenAPI-generated client. Exposes 37 tools (process, task, incident, deployment, history) and 5 widgets. |
| **analytics** (`packages/mcp-analytics/`)     | Queries the ClickHouse `camunda_history` database for performance, failure, and path-frequency analyses. 6 tools + 1 dashboard widget.                   |
| **engine-plugins** (`engine-plugins/`)        | Kotlin plugins for CIB Seven that mirror history events into ClickHouse. Independent build (Java 21, Gradle).                                            |
| **widgets** (`apps/mcp-gateway/mcp-app.html`) | A single Vite-built HTML bundle containing React, Tailwind, and every widget. The MCP host renders it inline when a tool returns `{ widget, data }`.     |

## External systems

| System                           | Purpose                                                                   | Default endpoint                     |
| -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Camunda 7 / CIB Seven            | The BPM engine itself — process definitions, instances, tasks, incidents. | `http://localhost:8410/engine-rest`  |
| ClickHouse                       | OLAP store for engine history, fed by the Kotlin plugins.                 | `http://localhost:8420`              |
| OpenTelemetry collector + Jaeger | Optional tracing pipeline.                                                | `:8431` (OTLP) · `:8440` (Jaeger UI) |

## Data flow

1. The MCP host calls a tool on the server (e.g. `camunda7_list_incidents`).
2. The server delegates to the matching module's plugin.
3. The plugin calls the relevant external system (REST for the engine, SQL for ClickHouse) and returns structured content.
4. Widget tools also return a `widget` key — the host renders the corresponding React component from the shared bundle and feeds it the `data`.

## Repository layout

| Path                | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `apps/mcp-gateway/` | The MCP gateway entry point and the widget bundle.          |
| `packages/`         | Reusable libraries — clients, MCP plugins, widget-shell.    |
| `engine-plugins/`   | Kotlin history plugins.                                     |
| `examples/`         | Standalone showcases (miravelo-upstream, cibseven-example). |
| `docker/`           | Compose stack for engine, ClickHouse, OTEL.                 |

For deeper detail, the root [`README.md`](https://github.com/miragon/miragon-ai/blob/main/README.md) keeps the full module table and tool list.
