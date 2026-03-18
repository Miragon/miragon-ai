# Camunda 7 MCP Ecosystem

A multi-engine MCP-based ecosystem for Camunda 7-compatible process engines. Provides AI-powered process management through [Model Context Protocol](https://modelcontextprotocol.io/) tools, interactive UI apps, and a ClickHouse analytics pipeline.

## Supported Engines

| Engine | Status |
|--------|--------|
| **CIB Seven** | Primary — fully supported |
| **Camunda 7** | Fully supported |
| **Operaton** | Placeholder — structure ready |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            MCP Host (Claude, ChatGPT, ...)          │
│  ┌────────────────┐  ┌───────────────────────────┐  │
│  │  MCP Apps (UI) │  │  camunda7-mcp-server      │  │
│  │  6 React Apps  │  │  43 Tools + 3 Resources   │  │
│  └───────┬────────┘  └────────────┬──────────────┘  │
└──────────┼────────────────────────┼─────────────────┘
           │                        │
           ▼                        ▼
┌───────────────────────┐  ┌──────────────────────┐
│   Engine Adapter      │  │ ClickHouse           │
│   (Multi-Engine)      │  │ (History Analytics)  │
└───┬───────┬───────┬───┘  └──────────────────────┘
    │       │       │                ▲
    ▼       ▼       ▼                │
┌───────┐┌───────┐┌───────┐  History Events
│Camunda││  CIB  ││Operat.│  (Kotlin Plugins)
│   7   ││ Seven ││       │
└───────┘└───────┘└───────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/engine-adapter` | Multi-engine REST API abstraction layer |
| `packages/camunda7-mcp-server` | MCP server with 43 tools + 3 resources |
| `packages/camunda7-mcp-apps` | 6 interactive UI apps + 3 action tools (sunpeak) |
| `packages/shared` | Shared TypeScript types and Zod schemas |
| `plugins/shared-history-clickhouse` | Engine-agnostic ClickHouse client + buffered handler |
| `plugins/camunda7-history-clickhouse` | Camunda 7 history event plugin |
| `plugins/cibseven-history-clickhouse` | CIB Seven history event plugin |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker (for ClickHouse + Engine)

### 1. Start the infrastructure

```bash
cd docker
docker compose up -d
```

This starts CIB Seven + ClickHouse with the history plugin pre-configured.

### 2. Build

```bash
pnpm install
pnpm build
```

### 3. Configure MCP client

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "camunda7": {
      "command": "node",
      "args": ["packages/camunda7-mcp-server/dist/index.js"],
      "env": {
        "ENGINE_TYPE": "cibseven",
        "ENGINE_BASE_URL": "http://localhost:8080/engine-rest",
        "ENGINE_AUTH_TYPE": "basic",
        "ENGINE_USERNAME": "demo",
        "ENGINE_PASSWORD": "demo"
      }
    }
  }
}
```

### 4. Optional: Enable ClickHouse search tools

Add these environment variables to also expose the 6 ClickHouse-powered search/analytics tools:

```
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=camunda
CLICKHOUSE_PASSWORD=camunda123
CLICKHOUSE_DATABASE=camunda_history
```

### 5. Optional: OTEL Observability

```bash
cd docker
docker compose --profile otel up -d
```

This adds OTEL Collector + Jaeger UI (http://localhost:16686) with trace context propagation across all components.

## MCP Tools (43)

### Engine Tools (37)

| Category | Tools |
|----------|-------|
| Process Definitions | `list_process_definitions`, `get_process_definition_xml`, `start_process_instance` |
| Process Instances | `list_process_instances`, `get_process_instance`, `get_activity_instance_tree`, `delete_process_instance`, `modify_process_instance` |
| User Tasks | `list_tasks`, `get_task`, `claim_task`, `unclaim_task`, `complete_task`, `set_task_assignee` |
| Messages & Signals | `correlate_message`, `throw_signal` |
| Variables | `get_variables`, `set_variable` |
| History | `query_historic_process_instances`, `query_historic_activity_instances`, `query_historic_task_instances`, `query_historic_variable_instances` |
| Incidents & Jobs | `list_incidents`, `resolve_incident`, `list_jobs`, `set_job_retries` |
| External Tasks | `fetch_and_lock`, `complete_external_task`, `handle_external_task_failure` |
| Deployments | `list_deployments`, `create_deployment` |

### ClickHouse Search Tools (6)

| Tool | Description |
|------|-------------|
| `search_process_instances` | Flexible search with filters, variable matching, incident join |
| `analyze_process_performance` | KPI overview + activity bottleneck ranking |
| `find_failed_instances` | Error pattern analysis with grouping |
| `search_by_variable` | Find instances by business variable values |
| `trace_process_execution` | Combined OTEL traces + process history |
| `compare_execution_periods` | Before/after deployment comparison |

## MCP Resources

| Resource | URI |
|----------|-----|
| Process Definitions | `camunda7://process-definitions` |
| BPMN XML | `camunda7://process/{key}/xml` |
| Process Stats | `camunda7://process/{key}/stats` |

## MCP Apps (UI)

| App | Description |
|-----|-------------|
| Process List | Deployed process definitions with status badges |
| Task Dashboard | Interactive task management with claim/complete |
| Instance Detail | Activity tree, variables, BPMN XML |
| Analytics Dashboard | KPIs, duration metrics, process grouping |
| History Timeline | Color-coded activity execution timeline |
| Incident Panel | Error monitoring with retry actions |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENGINE_TYPE` | `cibseven` | `camunda7`, `cibseven`, or `operaton` |
| `ENGINE_BASE_URL` | `http://localhost:8080/engine-rest` | Engine REST API URL |
| `ENGINE_AUTH_TYPE` | `basic` | `basic`, `bearer`, or `none` |
| `ENGINE_USERNAME` | — | Username for basic auth |
| `ENGINE_PASSWORD` | — | Password for basic auth |
| `ENGINE_TOKEN` | — | Token for bearer auth |
| `CLICKHOUSE_ENABLED` | `false` | Enable ClickHouse search tools |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `OTEL_ENABLED` | `true` | Enable OpenTelemetry instrumentation |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTEL Collector endpoint |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Kotlin plugins (requires Java 17+):

```bash
cd plugins
./gradlew build
```

## License

See [LICENSE](LICENSE) for details.
