# UC5 — `dev-fix-verification`

> "Das Deployment ist durch. Sieht im Cockpit okay aus. Aber _hat_ mein Fix die
> Metrik bewegt?"

## Szenario

Der Fix ist deployed, der Ticket-Owner will den Ticket schließen, der Dev will
Evidenz statt Gefühl. Der Skill zieht den Deployment-Timestamp aus Camunda,
rechnet Pre/Post über `analytics_cluster_compare`, und gibt ein klares
Verdikt — **IMPROVED / UNCHANGED / REGRESSED / INSUFFICIENT-SIGNAL** — mit
Zahlen, die man in den Ticket-Kommentar kopieren kann.

## Aufruf

```
/dev-fix-verification <deploymentId> [processDefinitionKey] [elementId] [windowDays]
```

- `deploymentId` — Pflicht. Wenn der Dev nur den Commit-Hash hat, kann er
  `camunda7_list_deployments` nutzen, um die Deployment-ID zu finden.
- `processDefinitionKey` — optional, engt den Vergleich auf einen Prozess ein.
- `elementId` — optional, engt die Incident-Rate-Seite auf ein Element ein
  (z.B. der Service-Task, den der Fix betrifft).
- `windowDays` — optional, Default `7`. Fenster vor und nach Deployment
  (gleich groß, `1..90`).

## Beteiligte Tools

| Schritt              | Tool                             | Server          |
| -------------------- | -------------------------------- | --------------- |
| Deployment-Metadaten | `camunda7_get_deployment`        | `camunda7-mcp`  |
| Pre/Post-Vergleich   | `analytics_cluster_compare`      | `analytics-mcp` |
| Widget (optional)    | `analytics_show_cluster_compare` | `analytics-mcp` |

## Workflow

```
1. Deployment-Timestamp holen
   → camunda7_get_deployment
   → deploymentTime ist der Anker-Timestamp

2. Fenster-Viabilität prüfen
   → Wenn now() - deploymentTime < 1 Tag: Warnung, Verdikt wird
     "INSUFFICIENT-SIGNAL"

3. Vergleich rechnen
   → analytics_cluster_compare(deploymentTimestamp, windowBefore=N,
     windowAfter=N, minBucketSize=10)
   → kpis (before/after) + delta (pro Metrik)

4. Verdikt klassifizieren
   → suppressed: true                                 → INSUFFICIENT-SIGNAL
   → failure_rate_delta <= -2pp ODER incident_rate_delta <= -2pp
     (und die andere ist nicht regrediert)            → IMPROVED
   → failure_rate_delta >= +2pp ODER incident_rate_delta >= +2pp
     ODER p95_duration_delta >= +25%                  → REGRESSED
   → sonst                                            → UNCHANGED

5. Verdikt-Block emittieren
```

## Beispiel-Ausgabe (gegen den `loanApproval`-Seed)

Der Seeder setzt den ersten von zwei 15-Tage-Blöcken als "pre-fix"-Ära an, in
der `NotifyApplicantDelegate` mit 15% Wahrscheinlichkeit eine
`RuntimeException` wirft und Incidents erzeugt. Der Cutoff in der Mitte des
Fensters ist der simulierte Deployment-Timestamp.

```markdown
# Fix verification: deployment `loanApproval-seed-deploy`

## Verdict

**IMPROVED**

Failure rate dropped from 15.4% to 0.2% on element `Task_notifyApplicant` of
`loanApproval`.

## Deployment

- ID: `loanApproval-seed-deploy` (Seed-Cutoff zwischen buggy-era und post-fix)
- Timestamp: `2026-04-04 00:00:00 UTC` (T0 - 15 Tage)
- Name / source: `loanApproval.bpmn` mit gefixtem Delegate
- Window: ±7 days

## KPIs

| Metric        | Before | After | Δ       |
| ------------- | ------ | ----- | ------- |
| Instances     | 46     | 52    | +13.0%  |
| Failure rate  | 15.4%  | 0.2%  | -15.2pp |
| Incident rate | 13.0%  | 0.0%  | -13.0pp |
| Avg duration  | 48ms   | 42ms  | -12%    |
| P95 duration  | 260ms  | 110ms | -58%    |

## Caveats

- Suppressed: false (beide Fenster > minBucketSize=10 Instanzen).
- Window age: Post-Fenster vollständig (7 von 7 Seed-Tagen).
- Scope: process=`loanApproval`, element=`Task_notifyApplicant`.

## Recommendation

Ticket schließen. Der Fix hat die Fehlerrate auf praktisch null gedrückt und
die p95-Dauer halbiert — keine Hinweise auf Regressionen in anderen Metriken.
Die verbleibenden 0.2% stammen aus einem einzelnen Retry-Event am Tag nach
dem Cutoff.
```

## Kontext-Politik

- Git-Metadaten (Commit-Hash, Deployment-ID, Timestamps) werden **wörtlich
  zitiert** — sie sind öffentliche Build-Metadaten, nicht Instanz-Payload.
- **Variableninhalte** werden nicht zitiert.
- Der `suppressed`-Flag ist **autoritativ**: ein Fix, der nach den Zahlen
  besser aussieht aber in einem suppressed Bucket liegt, bekommt
  **INSUFFICIENT-SIGNAL**, nicht IMPROVED. Thresholds per Hand drehen ist
  unerwünscht — wenn der Dev eine engere Vorgabe hat ("von 8% auf unter 1%"),
  nennt der Skill diese Grenze wörtlich im Verdikt.

## Wann _nicht_ einsetzen

- Als generelle Post-Deploy-Dashboard-Ablösung — der Skill schaut auf einen
  Punkt (ein Deployment, ein Fenster). Für kontinuierliches Monitoring ist
  Grafana/OTEL das richtige Werkzeug.
- Wenn das Deployment keinen messbaren Pfad anfasst (reines Refactoring, nur
  Tests, nur Doku) — der Skill wird dann korrekt "UNCHANGED" sagen, aber die
  Zeit hättest du dir sparen können.
