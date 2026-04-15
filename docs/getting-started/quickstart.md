# Quickstart

## 1. Repository klonen und bauen

```bash
git clone <repo-url>
cd camunda7-mcp-ecosystem
pnpm install
pnpm build
```

## 2. Infrastruktur starten

```bash
cd docker
docker compose up -d
```

Das startet:

- **CIB Seven** auf Port 8080 (mit History Plugin)
- **ClickHouse** auf Port 8123

Warte bis CIB Seven healthy ist:

```bash
docker compose ps
```

## 3. MCP Server konfigurieren

Füge den Server in deine MCP-Client-Konfiguration ein:

### Claude Desktop / Claude Code

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
    }
  }
}
```

## 3b. MCP Apps konfigurieren (optional)

Die MCP Apps liefern interaktive UI-Komponenten direkt im Chat. Starte den Apps-Server:

```bash
cd packages/camunda7-mcp-apps
pnpm build && pnpm start
```

Dann verbinde deinen MCP-Client:

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

Details: [Verbindung & Setup](../mcp-apps/verbindung.md)

## 4. Testen

Frage deinen KI-Assistenten:

> "Zeige mir alle deployed Prozessdefinitionen"

> "Starte eine Instanz des Prozesses 'invoice' mit businessKey 'INV-2024-001'"

> "Welche Tasks sind offen?"

## 5. Optional: ClickHouse-Suche aktivieren

Füge diese Umgebungsvariablen hinzu um die 6 ClickHouse-Analytics-Tools zu aktivieren:

```
CLICKHOUSE_ENABLED=true
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=camunda
CLICKHOUSE_PASSWORD=camunda123
CLICKHOUSE_DATABASE=camunda_history
```

## 6. Optional: OTEL Observability

```bash
cd docker
docker compose --profile otel up -d
```

Jaeger UI: http://localhost:16686
