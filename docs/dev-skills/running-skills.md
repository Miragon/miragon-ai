# Skills im Stack ausführen

> Wie man die Dev Skills in Claude Code aufruft — von der Installation bis zum
> konkreten Prompt.

## 1. Voraussetzungen

Die Dev Skills konsumieren drei MCP-Server. Alle drei müssen erreichbar sein,
damit die Skills vollständig laufen. Fehlt einer, degradieren die Skills (siehe
jeweilige Skill-Doku).

| Server           | Wofür                                                                              | Pflicht für                                                                       |
| ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `camunda7-mcp`   | BPMN-XML, Deployment-Metadaten                                                     | UC1, UC5                                                                          |
| `analytics-mcp`  | `path.frequency`, `element.bottleneck`, `variable.distribution`, `cluster.compare` | UC1, UC2, UC4, UC5, UC6                                                           |
| `enrichment-mcp` | `auto_resolve` für Segment-Benennung                                               | optional — alle Skills funktionieren auch ohne, berichten aber ohne Segment-Namen |

Basis-Setup der MCP-Server: siehe [Quickstart](../getting-started/quickstart.md).
ClickHouse-Analytics muss aktiv sein (`CLICKHOUSE_ENABLED=true`), damit
`analytics-mcp` die aggregierten Tools anbietet.

## 2. Skills installieren

Die fünf Skills liegen im Repo unter `.claude/skills/<name>/SKILL.md`. In Claude
Code werden sie automatisch erkannt, sobald das Repo als Workspace geöffnet
wird — das Verzeichnis `.claude/skills/` ist die Standard-Quelle.

```
.claude/skills/
├── dev-process-explain/SKILL.md
├── dev-change-impact/SKILL.md
├── dev-test-scenarios-from-production/SKILL.md
├── dev-fix-verification/SKILL.md
└── dev-code-archaeology/SKILL.md
```

Für globale Verfügbarkeit (auch in anderen Repos) die Skill-Ordner nach
`~/.claude/skills/` kopieren.

## 3. MCP-Server in Claude Code verbinden

Minimale `~/.claude/mcp.json` für alle fünf Skills:

```jsonc
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
        "ENGINE_PASSWORD": "demo",
        "CLICKHOUSE_ENABLED": "true",
        "CLICKHOUSE_URL": "http://localhost:8123",
        "CLICKHOUSE_USER": "camunda",
        "CLICKHOUSE_PASSWORD": "camunda123",
        "CLICKHOUSE_DATABASE": "camunda_history",
      },
    },
    "analytics": {
      "command": "node",
      "args": ["<pfad>/modules/analytics/mcp/dist/index.js"],
      "env": {
        "CLICKHOUSE_URL": "http://localhost:8123",
        "CLICKHOUSE_USER": "camunda",
        "CLICKHOUSE_PASSWORD": "camunda123",
        "CLICKHOUSE_DATABASE": "camunda_history",
      },
    },
    "enrichment": {
      "command": "node",
      "args": ["<pfad>/modules/enrichment/mcp/dist/index.js"],
      "env": {
        "ENRICHMENT_CONFIG": "<pfad>/modules/enrichment/examples/customer.yaml",
      },
    },
  },
}
```

Nach dem Speichern: Claude Code neu starten oder `MCP-Server neu laden`.
`claude mcp list` zeigt, ob die Server registriert sind.

## 4. Skill aufrufen

Jeder Skill wird via `/<skill-name> <argumente>` getriggert. Die
`argument-hint`-Frontmatter-Zeile in der Skill-Datei zeigt die erwartete
Argument-Syntax.

Die Beispiele unten zielen auf den `loanApproval`-Seed im
`cibseven-example` — sie sind nach einem `docker compose up -d` direkt
lauffähig.

### UC1 — Prozess erklären

```
/dev-process-explain loanApproval 30d
```

Ohne Periode → Default `30d`. Falls der Key fehlt, fragt der Skill einmal nach.

### UC2 — Änderung projizieren

```
/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/NotifyApplicantDelegate.kt:28
```

Oder freie Beschreibung:

```
/dev-change-impact "lift amount threshold for automatic approval from 25000 to 50000"
```

### UC4 — Tests aus Produktion erzeugen

```
/dev-test-scenarios-from-production loanApproval 30d bpm-assert
```

Framework optional (`junit` oder `bpm-assert`, Default `bpm-assert`).

### UC5 — Fix verifizieren

```
/dev-fix-verification <deploymentId> loanApproval Task_notifyApplicant 7
```

`deploymentId` stammt aus `camunda7_list_deployments` — im Seed ist das die
Deployment-ID des `loanApproval.bpmn`. Die Zeitachse wird über den Seed-
Zeitstempel simuliert; der "Fix" ist konzeptionell der Cutoff zwischen
Buggy-Era und heute (siehe [README](README.md) → Deployment-Era).

### UC6 — Code-Archäologie

```
/dev-code-archaeology plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/NotifyApplicantDelegate.kt:20
```

Oder die seltene FAX-Bedingung paraphrasieren:

```
/dev-code-archaeology "instances where channel == 'FAX'"
```

## 5. Debugging

**Skill meldet "Tool nicht verfügbar":** Einer der drei MCP-Server fehlt oder
exportiert das Tool nicht. `claude mcp tools` listet auf, was gerade angebunden
ist.

**`suppressed: true` in jedem Report:** Der gewählte Zeitraum enthält weniger
als `minBucketSize` Instanzen. Zeitraum vergrößern (`90d`) oder
`processDefinitionKey` weglassen, um über alle Prozesse zu aggregieren.

**Enrichment-Lookups leer:** `ENRICHMENT_CONFIG` zeigt auf keine gültige YAML-
Datei oder die Variable-Namen matchen keine `lookup`-Definition. Siehe
[Enrichment-Modul](../mcp-server/tools-reference.md) für die YAML-Struktur.

**Delegate nicht gefunden (UC1, UC2, UC6):** Der Skill erwartet den Java-Code
im aktuellen Workspace. Ist der Code in einem anderen Repo, den Workspace
erweitern oder den Skill manuell mit `Read`/`Grep` führen.

## 6. Skill-Output persistieren

Standardmäßig werden die Reports **nicht** auf die Platte geschrieben. Das ist
Absicht — sie sollen im Chat lebendig bleiben und iteriert werden. Wer den
Report im Ticket/PR braucht, kann ihn nach der Ausführung mit einem zweiten
Turn speichern lassen:

```
Speicher das als docs/process-analysis/loanApproval-2026-04.md
```

Oder das Ergebnis in die Zwischenablage kopieren und in Jira/GitHub einfügen.
