# UC1 — `dev-process-explain`

> "Ich muss morgen ein Feature an diesem Prozess bauen. Ich hab ihn nicht
> geschrieben. Was macht er eigentlich?"

## Szenario

Eine Entwicklerin wird auf einen Camunda-7-Prozess gezogen, den sie nie gesehen
hat. Sie könnte das BPMN aufmachen und den Java-Code lesen — aber weder BPMN
noch Code verraten, welche Pfade in Produktion tatsächlich laufen, wo es
klemmt und wer die Edge Cases auslöst. Der Skill produziert eine **behavior-
first Onboarding-Doku**, die diese Fragen in einem Rutsch beantwortet.

## Aufruf

```
/dev-process-explain <processDefinitionKey> [period: 1d|7d|30d|90d]
```

- `processDefinitionKey` — Pflicht. Fehlt er, fragt der Skill einmal nach.
- `period` — optional, Default `30d`.

## Beteiligte Tools

| Schritt           | Tool                                  | Server                      |
| ----------------- | ------------------------------------- | --------------------------- |
| BPMN laden        | `camunda7_get_process_definition_xml` | `camunda7-mcp`              |
| Delegate-Code     | `Read`, `Grep`, `Glob`                | Workspace                   |
| Pfad-Verteilung   | `analytics_path_frequency`            | `analytics-mcp`             |
| Bottlenecks       | `analytics_element_bottleneck`        | `analytics-mcp`             |
| Segment-Benennung | `enrichment_auto_resolve`             | `enrichment-mcp` (optional) |

## Workflow

```
1. BPMN-Struktur extrahieren
   → Start/End-Events, Service- und User-Tasks, Gateways, Listener
   → Element-IDs merken (werden in allen Folgeschritten referenziert)

2. Delegate-Code lesen
   → Für jede camunda:class / delegateExpression die Quelldatei finden
   → Nur soviel lesen wie für den Kontrakt nötig ist (Eingaben, Side Effects)

3. Pfad-Häufigkeit abfragen
   → analytics_path_frequency (minBucketSize=10, limit=20)
   → Dominanter Pfad, Sekundärpfade, Longtail, Suppressed

4. Bottlenecks
   → analytics_element_bottleneck mit gleichem Key + Periode
   → Heiße Elemente, langsame Elemente, fehleranfällige Elemente

5. Segment-Charakterisierung (optional)
   → Für repräsentative Variable-Namen enrichment_auto_resolve aufrufen
   → "Pfad B ist fast ausschließlich Enterprise + multi-currency"

6. Onboarding-Doc komponieren
```

## Beispiel-Ausgabe (gekürzt, gegen den Seed des `cibseven-example`)

```markdown
# Process: loanApproval

## TL;DR

Einfacher Freigabeprozess für Kreditanträge. Dominanter Pfad ist die
Ablehnung über `Task_notifyApplicant` (~58%), Freigaben laufen als User-Task
`Task_bankTransfer`. Ein seltener Legacy-Kanal (`channel="FAX"`) bleibt mit
unter 1% unter der minBucketSize-Schwelle.

## Behavior in production (last 30d)

- Path A (Rejected): 58% — `StartEvent_1 → Task_0dfv74n → Gateway_approved → Task_notifyApplicant → EndEvent_rejected`
- Path B (Approved + transfer): 31% — endet auf `EndEvent_approved` mit abgeschlossener `Task_bankTransfer`
- Path C (Approved + pending transfer): 11% — `Task_bankTransfer` hängt noch im Postfach
- Suppressed: 1 Pfad (FAX-Kanal) unter minBucketSize=10

## Where the time goes

- `Task_0dfv74n` (userTask "Check the request"): avg 3.1h, p95 28h — User-Latenz, Long-Tail bis mehrere Tage
- `Task_bankTransfer` (userTask, candidateGroup=accounting): avg 5.4h, p95 36h
- `Task_notifyApplicant` (serviceTask, asyncBefore): avg 45ms, p95 120ms — bis auf die Buggy-Era unauffällig

## Where it breaks

- `Task_notifyApplicant`: 8.2% Fehlerrate **nur in den ersten 15 Seed-Tagen**
  (Delegate `com.camunda7mcp.example.cibseven.NotifyApplicantDelegate`,
  RuntimeException "Downstream notification service unreachable"). Nach dem
  Fix-Stichtag unter 0.5%.

## Segment characterization

Ablehnungen konzentrieren sich bei `amount > 100.000` und
`customerSegment="PRIVATE"`; Enterprise-Instanzen werden trotz hoher Beträge
überproportional freigegeben. `channel="FAX"` läuft fast ausschließlich durch
die Reject-Seite — hängt vermutlich mit dem Legacy-Partner zusammen.

## Code map

| Element ID           | Typ         | Class / Expression                                       |
| -------------------- | ----------- | -------------------------------------------------------- |
| Task_0dfv74n         | userTask    | `assignee=demo`                                          |
| Gateway_approved     | exclusive   | `${approved == true}` / `${approved == false}`           |
| Task_bankTransfer    | userTask    | `candidateGroups=accounting`                             |
| Task_notifyApplicant | serviceTask | `${notifyApplicantDelegate}` — `NotifyApplicantDelegate` |
```

## Kontext-Politik

- **Kein Instanz-Zitat.** Kein Kundenname, keine Bestellnummer, kein
  Variableninhalt landet in der Doku.
- BPMN-Element-IDs, Delegate-FQNs, Gateway-Bedingungen: ja, wörtlich.
- Fehlt Enrichment, wird der Segment-Abschnitt ausgelassen mit Hinweis "nicht
  konfiguriert".

## Wann _nicht_ einsetzen

- Wenn keine produktive Historie existiert (`suppressed`: true in jedem Pfad) —
  dann liefert der Skill nur BPMN-Struktur + Code-Kontrakt, was genauso gut
  durch manuelles Lesen geht.
- Wenn ein konkretes Symptom gejagt wird (Fehlersuche, einzelne Instanz) — dafür
  ist [UC5](dev-fix-verification.md) oder direkter SQL-Zugriff geeigneter.
