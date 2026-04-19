# Dev Skills

> 5 Entwickler-Workflows, die Laufzeitverhalten eines Camunda-7-Prozesses in
> Claude Code sichtbar machen — ohne die IDE zu verlassen.

## Zielgruppe

Entwickler, die in der IDE an einem Camunda-Prozess arbeiten und eine der
folgenden Fragen beantworten müssen:

- "Was macht dieser Prozess eigentlich in Produktion?"
- "Was würde meine Änderung im Feld bewirken?"
- "Welche Testfälle bilden die Realität ab?"
- "Hat mein Fix das Problem gelöst?"
- "Warum existiert dieser Code — und wird er noch benutzt?"

Alle fünf Skills arbeiten **rein auf Aggregaten** (Pfad-Häufigkeiten,
Bucket-Verteilungen, Segment-Lookups). Keine individuellen Instanz-Daten,
keine Rohwerte von Variablen — die Skills respektieren `minBucketSize` (Default 10) und markieren unterdrückte Buckets statt sie zu extrapolieren.

## Übersicht

| #   | Skill                                                         | Trigger                            | Kernidee                                                    |
| --- | ------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| UC1 | [`dev-process-explain`](dev-process-explain.md)               | Onboarding auf unbekannten Prozess | BPMN + Delegate-Code + Path-Frequency → Behavior-first-Doku |
| UC2 | [`dev-change-impact`](dev-change-impact.md)                   | Vor Commit / Deploy                | Variable-Distribution → Reklassifikation projizieren        |
| UC4 | [`dev-test-scenarios-from-production`](dev-test-scenarios.md) | Testabdeckung erzeugen             | Top-Pfade + Bucket-Repräsentanten → JUnit/BPM-Assert        |
| UC5 | [`dev-fix-verification`](dev-fix-verification.md)             | Nach Deploy                        | Pre/Post-Vergleich mit `cluster.compare` → Verdikt          |
| UC6 | [`dev-code-archaeology`](dev-code-archaeology.md)             | Code-Stelle wirkt tot / verdächtig | Git + 12-Monats-Path-Frequency → ALIVE / DEAD / UNKNOWN     |

## Referenz-Beispiel: `loanApproval`

Alle Beispielausgaben in den Skill-Docs nutzen den `loanApproval`-Prozess aus
[`plugins/examples/cibseven-example`](../../plugins/examples/cibseven-example).
Der Seeder erzeugt pro Startup 200 Instanzen über 30 Tage mit:

- **Pfade** — Standard-Approval (`StartEvent_1 → Task_0dfv74n → Gateway_approved → Task_bankTransfer → EndEvent_approved`) dominiert; der Reject-Pfad (`... → Task_notifyApplicant → EndEvent_rejected`) tritt abhängig von Kredithöhe + Segment auf.
- **Variablen** — `amount` (log-skew, 1k–500k), `applicant`, `loanType`, `customerSegment` (PRIVATE / BUSINESS / ENTERPRISE), `currency` (EUR / USD / GBP), `channel` (ONLINE / FAX — FAX < 1%).
- **Deployment-Era** — die ersten 15 von 30 Seed-Tagen zählen als "pre-fix": `NotifyApplicantDelegate` wirft mit 15% Wahrscheinlichkeit und erzeugt Incidents. Danach ist der Bug gefixt → `cluster.compare` zeigt einen klaren Drop.

Das ist die Grundlage, damit die Beispielausgaben in den Skill-Docs ohne
Handwaving reproduzierbar sind — starte CIB Seven mit dem `seed`-Profil und
rufe den jeweiligen Skill auf.

## Gemeinsame Grundlagen

Alle Skills kombinieren dieselben Bausteine:

```
       BPMN + Delegate-Code         camunda7-mcp (Engine)
                │                              │
                ▼                              ▼
       ┌──────────────────┐           ┌──────────────────┐
       │ Local Workspace  │           │ Deployment-Meta  │
       │ Read / Grep      │           │ get_deployment   │
       └────────┬─────────┘           └────────┬─────────┘
                │                              │
                └─────────────┬────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │ analytics-mcp       │
                   │ path.frequency      │
                   │ element.bottleneck  │
                   │ variable.distribution│
                   │ cluster.compare     │
                   └──────────┬──────────┘
                              ▼
                   ┌─────────────────────┐
                   │ enrichment-mcp      │
                   │ auto_resolve        │
                   │ (Segment-Benennung) │
                   └─────────────────────┘
```

- **`camunda7-mcp`** liefert BPMN-XML und Deployment-Metadaten (v.a. für UC5).
- **`analytics-mcp`** liefert die aggregierten Laufzeitmetriken aus ClickHouse.
- **`enrichment-mcp`** übersetzt Variablenkombinationen in fachliche Segmente
  ("Enterprise + multi-currency") via YAML-deklarierte Lookups.
- **Workspace-Tools** (`Read`, `Grep`, `Glob`, `Bash(git *)`) decken lokale Code-
  und Historien-Lesung ab.

## Kontext-Politik

Hart verdrahtet in jeden Skill:

1. **Aggregate only.** Kein Skill lädt einen einzelnen Prozess-Instanz-
   Datensatz. Bei UC4 sind die konkreten Test-Werte immer _Bucket-
   Repräsentanten_ (numerischer Midpoint, modales Top-K), nie echte
   Produktionswerte.
2. **`minBucketSize` ist kein Vorschlag.** Suppressed Buckets werden im Report
   aufgelistet, nicht überschrieben.
3. **Code, BPMN-IDs, Delegate-FQNs** dürfen wörtlich zitiert werden. **Variablen-
   werte** nicht.
4. **Git-Metadaten** (Hash, Timestamp, Deployment-ID) werden wörtlich zitiert —
   das ist öffentliche Metadaten-Information, keine Instanz-Payload.

## Ausführung im Stack

Siehe [Skills im Stack ausführen](running-skills.md) — MCP-Server-Setup,
Skill-Installation, Aufruf in Claude Code.
