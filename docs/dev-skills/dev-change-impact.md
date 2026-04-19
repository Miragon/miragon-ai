# UC2 — `dev-change-impact`

> "Ich will diesen Schwellwert von 10.000 auf 20.000 anheben. Wie viele Instanzen
> würden anders klassifiziert — und _wer_ sind die?"

## Szenario

Eine Entwicklerin steht kurz vor dem Commit: sie will einen Schwellwert, eine
Gateway-Bedingung oder eine `in(...)`-Liste anpassen. Bevor sie deployed, will
sie wissen, wie viele Instanzen die neue Logik über die letzten 30 Tage anders
geroutet hätte — und welche Kundensegmente betroffen wären. Der Skill
produziert einen **One-Pager für die Entscheidung**: ship as-is, oder vorher
fachliches OK einholen.

## Aufruf

```
/dev-change-impact <file>:<line>
/dev-change-impact "<freie Beschreibung der Änderung>"
```

Beispiele (gegen den `loanApproval`-Seed):

```
/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/TestDataSeeder.kt:194
/dev-change-impact "lift auto-approval amount threshold from 25000 to 50000"
```

## Beteiligte Tools

| Schritt                   | Tool                                | Server                      |
| ------------------------- | ----------------------------------- | --------------------------- |
| Änderung verankern        | `Read`, `Grep`, `Glob`              | Workspace                   |
| BPMN-Element finden       | `Grep` über `*.bpmn` + Delegate-FQN | Workspace                   |
| Element-Traffic           | `analytics_element_bottleneck`      | `analytics-mcp`             |
| Variable-Verteilung       | `analytics_variable_distribution`   | `analytics-mcp`             |
| Segment-Charakterisierung | `enrichment_auto_resolve`           | `enrichment-mcp` (optional) |

## Workflow

```
1. Änderung verankern
   → File + Zeile lesen, Variable + alte Prädikat + neue Prädikat extrahieren
   → Delegate-FQN festhalten

2. BPMN-Element auflösen
   → Grep der *.bpmn-Dateien nach Delegate-FQN / delegateExpression
   → processDefinitionKey und elementId bestimmen

3. Baseline holen
   → analytics_element_bottleneck liefert Hits, Fehlerrate, Dauern

4. Variable-Verteilung holen
   → analytics_variable_distribution mit 20 Buckets (numerisch) oder
     topK=20 (kategorisch)

5. Projektion rechnen
   → Altes Prädikat vs. neues Prädikat auf die Verteilung anwenden
   → Reklassifikations-Count + -Share + Richtung

6. Segment-Charakterisierung
   → enrichment_auto_resolve mit repräsentativem Grenzwert
   → "Mostly Mid-Market with multi-currency"

7. One-Pager emittieren
```

## Beispiel-Ausgabe (gekürzt, gegen den Seed)

```markdown
# Impact: TestDataSeeder.kt:194 — lift threshold 25000 → 50000

## Change

- Old: `amount < 25_000 → base approval = 0.85`
- New: `amount < 50_000 → base approval = 0.85`
- Variable: `amount` (numeric)
- Element: `Gateway_approved` of `loanApproval` (exclusiveGateway)

## Projected reclassification (last 30d)

- Gateway fired **140 times** in the window (Seed-skaliert).
- **22 instances (22/140 = 15.7%)** würden unter der neuen Logik anders
  klassifiziert — alle im Bucket `[25000, 50000)` mit aktuell ~65% Approval,
  künftig ~85%.
- Direction: **mehr** Instanzen laufen in den Approval-Zweig.

## Affected segments

`[25000, 50000)` ist im Seed ~30% PRIVATE, ~55% BUSINESS, ~15% ENTERPRISE.
Der Shift trifft also primär Business-Kunden mit mittleren Kredithöhen.

## Side observations

- `Gateway_approved` today: 0% fail, avg 1ms, p95 3ms — Gateway selbst ist
  nicht der Engpass.
- Suppressed buckets nahe der Grenze: `[45000, 50000)` — nur 8 Observations.

## Recommendation

Vor Ship fachlich klären: 22 zusätzliche Instanzen pro Seed-Zyklus würden ohne
zusätzlichen Review durchgewunken — das ist bewusst so gewollt oder nicht.
Enterprise bleibt wegen des Segment-Bonus weitgehend unberührt.
```

## Kontext-Politik

- Code, Prädikate, Element-IDs: wörtlich zitiert.
- Variable-Werte: nicht zitiert. Der Skill berichtet nur Counts, Shares und
  Bucket-Ranges.
- Suppressed Buckets nahe der Grenze werden explizit markiert und **nicht**
  als 0 oder voll angenommen — der Report ist dann "unsicher", nicht "Null-
  Impact".

## Wann _nicht_ einsetzen

- Für reine Code-Refactorings ohne Verhaltens-Änderung — der Skill liefert dann
  0% Reclassified und ist Noise.
- Wenn die Änderung nur eine neue Variable einführt, die vorher nicht geschrieben
  wurde — `variable.distribution` hat dann keine Historie, Projektion
  unmöglich.
