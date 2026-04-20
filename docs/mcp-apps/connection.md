# Connection & Setup

This guide describes how to connect the MCP Apps to an MCP host (Claude Desktop, Claude Code).

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- A running MCP server (`camunda7-mcp-server`)
- A running engine (CIB Seven, Camunda 7, or Operaton)

## Development

Start the apps in development mode with the integrated simulator:

```bash
cd packages/camunda7-mcp-apps
pnpm dev
```

The simulator runs on `http://localhost:5180` and loads all 6 resources automatically from the simulation files in `tests/simulations/`.

## Production

Build the apps and start the server:

```bash
cd packages/camunda7-mcp-apps
pnpm build
pnpm start
```

The server starts on port 8000 by default. The port can be changed via `--port` or the `PORT` environment variable:

```bash
pnpm start -- --port 9000
# or
PORT=9000 pnpm start
```

## Configure the MCP client

> **Important:** `sunpeak start` runs an HTTP server with the Streamable HTTP transport on `/mcp`. The apps server must be started separately before the MCP client connects.

### 1. Start the apps server

```bash
cd packages/camunda7-mcp-apps
ENGINE_TYPE=cibseven \
ENGINE_BASE_URL=http://localhost:8080/engine-rest \
ENGINE_AUTH_TYPE=basic \
ENGINE_USERNAME=demo \
ENGINE_PASSWORD=demo \
pnpm start
```

### 2. Connect the MCP client

#### Claude Desktop

Add a second entry for the apps in `claude_desktop_config.json`:

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
    },
    "camunda-apps": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8000/mcp"]
    }
  }
}
```

#### Claude Code

In `.claude/settings.json` or per-project in `.mcp.json`:

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

## Environment variables

| Variable           | Description                                     | Default                             |
| ------------------ | ----------------------------------------------- | ----------------------------------- |
| `ENGINE_TYPE`      | Engine type: `camunda7`, `cibseven`, `operaton` | `cibseven`                          |
| `ENGINE_BASE_URL`  | Engine REST API URL                             | `http://localhost:8080/engine-rest` |
| `ENGINE_AUTH_TYPE` | Authentication: `basic`, `bearer`, `none`       | `basic`                             |
| `ENGINE_USERNAME`  | Username (for `basic` auth)                     | -                                   |
| `ENGINE_PASSWORD`  | Password (for `basic` auth)                     | -                                   |
| `ENGINE_TOKEN`     | Token (for `bearer` auth)                       | -                                   |

## How apps appear in chat

When an MCP tool such as `show-process-list` is called, it returns `structuredContent`. The MCP host then automatically renders the matching resource (e.g. `process-list`) as an interactive UI element directly in the chat.

The apps receive their data through the `useToolData()` hook and can call additional server tools (e.g. claim a task or retry a job) via `useCallServerTool()`.
