# Verbindung & Setup

Diese Anleitung beschreibt, wie du die MCP Apps mit einem MCP-Host (Claude Desktop, Claude Code) verbindest.

## Voraussetzungen

- Node.js >= 20
- pnpm >= 9
- Ein laufender MCP Server (`camunda7-mcp-server`)
- Eine laufende Engine (CIB Seven, Camunda 7 oder Operaton)

## Development

Starte die Apps im Entwicklungsmodus mit dem integrierten Simulator:

```bash
cd packages/camunda7-mcp-apps
pnpm dev
```

Der Simulator startet auf `http://localhost:5180` und lädt alle 6 Resources automatisch aus den Simulation-Dateien in `tests/simulations/`.

## Production

Baue die Apps und starte den Server:

```bash
cd packages/camunda7-mcp-apps
pnpm build
pnpm start
```

Der Server startet standardmäßig auf Port 8000. Der Port kann über `--port` oder die Umgebungsvariable `PORT` angepasst werden:

```bash
pnpm start -- --port 9000
# oder
PORT=9000 pnpm start
```

## MCP-Client konfigurieren

> **Wichtig:** `sunpeak start` startet einen HTTP-Server mit Streamable HTTP Transport auf `/mcp`. Der Apps-Server muss separat gestartet werden, bevor der MCP-Client verbunden wird.

### 1. Apps-Server starten

```bash
cd packages/camunda7-mcp-apps
ENGINE_TYPE=cibseven \
ENGINE_BASE_URL=http://localhost:8080/engine-rest \
ENGINE_AUTH_TYPE=basic \
ENGINE_USERNAME=demo \
ENGINE_PASSWORD=demo \
pnpm start
```

### 2. MCP-Client verbinden

#### Claude Desktop

Füge in `claude_desktop_config.json` einen zweiten Eintrag für die Apps hinzu:

```json
{
  "mcpServers": {
    "camunda7": {
      "command": "node",
      "args": ["<pfad>/packages/camunda7-mcp-server/dist/index.js"],
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

In `.claude/settings.json` oder projektspezifisch in `.mcp.json`:

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

## Umgebungsvariablen

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `ENGINE_TYPE` | Engine-Typ: `camunda7`, `cibseven`, `operaton` | `cibseven` |
| `ENGINE_BASE_URL` | REST-API URL der Engine | `http://localhost:8080/engine-rest` |
| `ENGINE_AUTH_TYPE` | Authentifizierung: `basic`, `bearer`, `none` | `basic` |
| `ENGINE_USERNAME` | Benutzername (bei `basic` Auth) | - |
| `ENGINE_PASSWORD` | Passwort (bei `basic` Auth) | - |
| `ENGINE_TOKEN` | Token (bei `bearer` Auth) | - |

## Wie Apps im Chat erscheinen

Wenn ein MCP-Tool wie `show-process-list` aufgerufen wird, liefert es `structuredContent` zurück. Der MCP-Host rendert dann automatisch die zugehörige Resource (z.B. `process-list`) als interaktives UI-Element direkt im Chat.

Die Apps erhalten die Daten via `useToolData()` Hook und können über `useCallServerTool()` weitere Server-Tools aufrufen (z.B. Task claimen oder Job retrien).
