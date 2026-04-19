# UC6 — `dev-code-archaeology`

> "Dieser else-Zweig sieht aus, als hätte ihn seit 2019 niemand angefasst. Kann
> ich den löschen?"

## Szenario

Der Entwickler stößt auf einen Code-Block, der tot wirkt — ein alter
`if orderType == "FAX"`-Zweig, ein Delegate, der nie mehr getriggert zu werden
scheint, eine Gateway-Bedingung mit veraltetem Wording. Reines Code-Lesen
reicht nicht: der Pfad könnte immer noch einmal pro Quartal feuern. Der Skill
kombiniert **Git-Historie + 12-Monats-Pfad-Häufigkeit** und liefert ein klares
Verdikt: ALIVE, DEAD, oder UNKNOWN.

## Aufruf

```
/dev-code-archaeology <file>:<line>
/dev-code-archaeology "<Beschreibung der Bedingung>"
```

Beispiele (gegen den `loanApproval`-Seed):

```
/dev-code-archaeology plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/TestDataSeeder.kt:152
/dev-code-archaeology "instances where channel == 'FAX'"
```

## Beteiligte Tools

| Schritt              | Tool                                       | Server                      |
| -------------------- | ------------------------------------------ | --------------------------- |
| Code verankern       | `Read`, `Grep`, `Glob`                     | Workspace                   |
| Git-Historie         | `Bash(git log/blame)`                      | Workspace                   |
| BPMN-Element finden  | `Grep` über `*.bpmn`                       | Workspace                   |
| Pfad-Häufigkeit (1a) | `analytics_path_frequency` mit period=365d | `analytics-mcp`             |
| Segment-Benennung    | `enrichment_auto_resolve`                  | `enrichment-mcp` (optional) |

## Workflow

```
1. Code verankern
   → File + Zeile lesen, Bedingung + Variable + umgebende Struktur verstehen
   → Delegate-FQN / Listener-Klasse / Gateway-Condition festhalten

2. BPMN-Element auflösen
   → Grep *.bpmn nach Delegate-FQN oder Gateway-ID
   → processDefinitionKey + elementId ermitteln

3. Git-Historie
   → git blame auf die Zeile → letzte Änderung (Autor, Datum, Commit)
   → git log auf die Datei → Häufigkeit der Änderungen, letzte Änderung

4. Laufzeit-Signal
   → analytics_path_frequency mit period=365d, minBucketSize=10
   → Wie oft lief der Pfad, der das Element enthält, in 12 Monaten?

5. Verdikt
   → 0 Runs in 365d, unterdrückt:              UNKNOWN (nicht DEAD — zu wenig
     Daten um sicher zu sein)
   → 0 Runs in 365d, nicht unterdrückt:         DEAD
   → <N> Runs in 365d, sehr selten:             ALIVE but rare (mit Segment-
     Kontext, wenn verfügbar)
   → regelmäßig:                                ALIVE

6. Empfehlung formulieren
```

## Beispiel-Ausgabe (gegen den `loanApproval`-Seed)

```markdown
# Archaeology: TestDataSeeder.kt:152 — `channel == "FAX"`

## Verdict

**UNKNOWN**

Der FAX-Kanal ist in den letzten 30 Seed-Tagen **< minBucketSize=10** mal
beobachtet worden. Das Ergebnis ist `suppressed: true` — nicht "tot", sondern
unter der Aggregations-Schwelle. Nicht löschen, ohne die Schwelle zu senken
oder den Beobachtungszeitraum zu verlängern.

## Laufzeit

- Pfad-Share (365d simuliert über Seed): ~0.5–1% (2 Observations)
- Letzter Run: innerhalb der Post-Fix-Ära
- Element: Routing-Variable `channel` in `loanApproval`
- `analytics_path_frequency` liefert den Pfad als `suppressed`, nicht als
  Zeile.

## Git-Historie

- Zuletzt geändert: 2026-04-18 (Seed-Erweiterung, Commit in `dominikhorn93/enrichment`)
- Davor: 2026-04-14 (`58a75ef`, initial seeder scaffold)
- Die `channel`-Variable wurde bewusst mit 1% FAX-Rate gesetzt — Motivation
  ist das Archäologie-Szenario selbst.

## Segment

Segment-Charakterisierung übersprungen: zu wenige Observations, damit
`enrichment_auto_resolve` stabil aggregieren könnte.

## Empfehlung

Nicht löschen. Optionen, um die Lebendigkeits-Frage sauber zu beantworten:

- Beobachtungszeitraum vergrößern (`90d`, ggf. `180d`).
- `minBucketSize` in der Analytics-Abfrage temporär auf 1 senken (mit
  Hinweis im Report, dass dann nicht mehr aggregiert wird).
- Oder den Pfad im Code markieren (`@LegacyPath`) und nach einem Quartal
  erneut prüfen.
```

## Kontext-Politik

- Git-Metadaten (Hash, Autor, Timestamp, Commit-Message) werden **wörtlich
  zitiert**.
- Variableninhalte nicht — nur Bedingung-Text wörtlich, nicht die beobachteten
  Werte.
- **UNKNOWN ist kein Feigenblatt.** Wenn der Pfad null Runs hat und das
  Ergebnis unterdrückt ist (weil `minBucketSize=10` unterschritten), sagt der
  Skill "kann ich nicht sicher entscheiden" — nicht "vermutlich tot". Die
  Entscheidung liegt beim Dev, nicht beim Skill.

## Wann _nicht_ einsetzen

- Für Fragen zur Code-_Qualität_ ("ist das gut geschrieben?") — der Skill sagt
  nichts dazu, das ist Review-Arbeit.
- Wenn der Pfad nicht an ein BPMN-Element bindbar ist (reiner Util-Code ohne
  Prozess-Bezug) — dann liefert der Skill nur Git-Historie, und die kriegst du
  auch ohne Skill.
