# MCP Apps

Die MCP Apps sind interaktive UI-Komponenten auf Basis des [sunpeak](https://sunpeak.dev) MCP App Frameworks. Sie rendern Cockpit-ähnliche Funktionen direkt in MCP-kompatiblen Hosts.

## Technologie-Stack

| Aspekt         | Technologie                        |
| -------------- | ---------------------------------- |
| Framework      | sunpeak 0.16                       |
| UI             | React 19 + Tailwind CSS            |
| State          | `useToolData` (sunpeak Hook)       |
| Interaktion    | `useCallServerTool` (sunpeak Hook) |
| Engine-Zugriff | `@camunda7-mcp/engine-adapter`     |

## Apps

| App                 | Zweck                            | Interaktiv? |
| ------------------- | -------------------------------- | ----------- |
| Process List        | Deployed Prozessdefinitionen     | Nein        |
| Task Dashboard      | Offene Tasks mit Claim/Complete  | Ja          |
| Instance Detail     | Activity Tree + Variablen + BPMN | Nein        |
| Analytics Dashboard | KPIs, Durchsatz, Dauer-Metriken  | Nein        |
| History Timeline    | Farbcodierte Activity-Timeline   | Nein        |
| Incident Panel      | Fehler-Monitoring mit Retry      | Ja          |

## Action Tools

Zusätzlich zu den 6 Display-Apps gibt es 3 Action-Tools für Benutzerinteraktionen:

| Tool                   | Beschreibung                              |
| ---------------------- | ----------------------------------------- |
| `claim-task-action`    | Task für einen User claimen               |
| `complete-task-action` | Task mit optionalen Variablen abschließen |
| `retry-job-action`     | Fehlgeschlagenen Job retrien              |

Detaillierter App-Katalog: [app-catalog.md](app-catalog.md)

Verbindung & Setup: [verbindung.md](verbindung.md)
