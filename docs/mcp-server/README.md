# MCP Server

The `camunda7-mcp-server` is an MCP server that talks to any Camunda-7-compatible
engine via the Engine Adapter.

## Features

- **43 MCP tools** (37 engine + 6 ClickHouse)
- **3 MCP resources** (process definitions, BPMN XML, statistics)
- **OTEL instrumentation** on every tool handler
- **Multi-engine** via environment variables

## Tech stack

| Aspect        | Technology                     |
| ------------- | ------------------------------ |
| Runtime       | Node.js / TypeScript           |
| MCP SDK       | `@modelcontextprotocol/sdk`    |
| Transport     | stdio                          |
| Validation    | Zod                            |
| Telemetry     | OpenTelemetry                  |
| Engine access | `@camunda7-mcp/engine-adapter` |

## Tool categories

| Category            | Count | Example                            |
| ------------------- | ----- | ---------------------------------- |
| Process Definitions | 3     | `start_process_instance`           |
| Process Instances   | 5     | `modify_process_instance`          |
| User Tasks          | 6     | `complete_task`                    |
| Messages & Signals  | 2     | `correlate_message`                |
| Variables           | 2     | `set_variable`                     |
| History             | 4     | `query_historic_process_instances` |
| Incidents & Jobs    | 4     | `set_job_retries`                  |
| External Tasks      | 3     | `fetch_and_lock`                   |
| Deployments         | 2     | `create_deployment`                |
| ClickHouse Search   | 6     | `search_process_instances`         |

Detailed tool reference: [tools-reference.md](tools-reference.md)
