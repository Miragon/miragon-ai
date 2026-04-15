# MCP Server

Der `camunda7-mcp-server` ist ein MCP-Server, der über den Engine Adapter mit jeder Camunda-7-kompatiblen Engine kommuniziert.

## Features

- **43 MCP-Tools** (37 Engine + 6 ClickHouse)
- **3 MCP-Resources** (Prozessdefinitionen, BPMN-XML, Statistiken)
- **OTEL-Instrumentierung** aller Tool-Handler
- **Multi-Engine** via Umgebungsvariablen

## Technologie-Stack

| Aspekt         | Technologie                    |
| -------------- | ------------------------------ |
| Runtime        | Node.js / TypeScript           |
| MCP SDK        | `@modelcontextprotocol/sdk`    |
| Transport      | stdio                          |
| Validation     | Zod                            |
| Telemetry      | OpenTelemetry                  |
| Engine-Zugriff | `@camunda7-mcp/engine-adapter` |

## Tool-Kategorien

| Kategorie           | Anzahl | Beispiel                           |
| ------------------- | ------ | ---------------------------------- |
| Process Definitions | 3      | `start_process_instance`           |
| Process Instances   | 5      | `modify_process_instance`          |
| User Tasks          | 6      | `complete_task`                    |
| Messages & Signals  | 2      | `correlate_message`                |
| Variables           | 2      | `set_variable`                     |
| History             | 4      | `query_historic_process_instances` |
| Incidents & Jobs    | 4      | `set_job_retries`                  |
| External Tasks      | 3      | `fetch_and_lock`                   |
| Deployments         | 2      | `create_deployment`                |
| ClickHouse Search   | 6      | `search_process_instances`         |

Detaillierte Tool-Referenz: [tools-reference.md](tools-reference.md)
