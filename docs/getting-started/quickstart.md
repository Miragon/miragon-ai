# Quickstart

## 1. Clone and build

```bash
git clone <repo-url>
cd camunda7-mcp-ecosystem
pnpm install
pnpm build
```

## 2. Start the infrastructure

```bash
cd docker
docker compose up -d
```

This starts:

- **CIB Seven** on port 8080 (with the History Plugin)
- **ClickHouse** on port 8123
- **WireMock** on port 8088 — backs the `*-local.yaml` enrichment demos.
  Optional: skip with `docker compose up -d cibseven clickhouse` if you don't
  need enrichment.

Wait for CIB Seven to be healthy:

```bash
docker compose ps
```

## 3. Configure the MCP server

Add the server to your MCP client configuration:

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "camunda7": {
      "command": "node",
      "args": ["<path>/packages/camunda7-mcp-server/dist/index.js"],
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

## 3b. Configure MCP Apps (optional)

The MCP Apps deliver interactive UI components straight into the chat. Start
the apps server:

```bash
cd packages/camunda7-mcp-apps
pnpm build && pnpm start
```

Then connect your MCP client:

```json
{
  "mcpServers": {
    "camunda-apps": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8000/mcp"]
    }
  }
}
```

Details: [Connection & Setup](../mcp-apps/connection.md)

## 4. Try it

Ask your AI assistant:

> "Show me all deployed process definitions"

> "Start an instance of process 'invoice' with businessKey 'INV-2024-001'"

> "Which tasks are open?"

## 5. Optional: enable ClickHouse search

Add these environment variables to enable the 6 ClickHouse analytics tools:

```
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=camunda
CLICKHOUSE_PASSWORD=camunda123
CLICKHOUSE_DATABASE=camunda_history
```

## 6. Optional: enable enrichment

`enrichment-mcp` is opt-in. Point `ENRICHMENT_CONFIG_PATH` at one of the
bundled demo YAMLs (both target the WireMock sidecar from step 2):

```bash
# from the repo root
export ENRICHMENT_CONFIG_PATH=$(pwd)/server/resources/enrichment-examples/miraveloLeasing-local.yaml
pnpm --filter @miragon-ai/server dev
```

| YAML                         | Pairs with                                                          |
| ---------------------------- | ------------------------------------------------------------------- |
| `miraveloLeasing-local.yaml` | `cibseven-example` seed (`customerSegment`, `region`, `channel`)    |
| `acme-local.yaml`            | Generic Salesforce / ERP / Contracts shape (`CUST-001`, `CUST-002`) |

Without the env var, the rest of the stack runs unchanged. See
[Configuration](configuration.md) and the
[enrichment YAML reference](../mcp-server/tools-reference.md#enrichment-mcp)
for the full schema.

## 7. Optional: OTEL observability

```bash
cd docker
docker compose --profile otel up -d
```

Jaeger UI: http://localhost:16686
