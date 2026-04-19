# UC4 — `dev-test-scenarios-from-production`

> "Meine Fixtures sind alle erfunden. Gib mir Testszenarien, die die echte
> Kombinatorik aus Produktion abbilden — ohne dass ich echte Kundendaten
> anfasse."

## Szenario

Der Entwickler schreibt seit Tagen synthetische Testfixtures und merkt, dass
sie die spannenden Kombinationen aus Produktion nicht treffen. "Cross-Border
Enterprise mit Teil-Lieferung" ist ein Szenario, das niemand aus dem Kopf
entwirft — aber Produktion sieht es täglich. Der Skill generiert **aus den
Top-Pfaden + Variable-Verteilungen echte Test-Szenarien** inklusive
lauffähigem JUnit- oder Camunda-BPM-Assert-Scaffolding.

## Aufruf

```
/dev-test-scenarios-from-production <processDefinitionKey> [period: 7d|30d|90d] [framework: junit|bpm-assert]
```

- `processDefinitionKey` — Pflicht.
- `period` — optional, Default `30d`.
- `framework` — optional, Default `bpm-assert` (liest bei Prozesstests
  natürlicher als reines JUnit).

## Beteiligte Tools

| Schritt             | Tool                              | Server                      |
| ------------------- | --------------------------------- | --------------------------- |
| Top-Pfade           | `analytics_path_frequency`        | `analytics-mcp`             |
| Fehler-Querverweis  | `analytics_element_bottleneck`    | `analytics-mcp`             |
| Variable-Verteilung | `analytics_variable_distribution` | `analytics-mcp`             |
| Segment-Benennung   | `enrichment_auto_resolve`         | `enrichment-mcp` (optional) |

## Workflow

```
1. Top-Pfade
   → analytics_path_frequency, limit=20, minBucketSize=10
   → Szenarien wählen:
     • Dominanter Pfad (>=50%) → "Happy Path"
     • Alle Pfade >=5% → "Varianten"
     • Pfade >=1% mit erhöhter Fehler-/Incident-Rate → "Edge Case worth a test"
   → Cap bei ~6 Szenarien (mehr pflegt der Dev nicht)

2. Variable-Verteilungen
   → Je Szenario die Gateway-Variablen identifizieren (aus BPMN/Delegate-Code
     oder einmalige Rückfrage an den User)
   → analytics_variable_distribution je Variable

3. Repräsentativen Wert pro Bucket wählen
   → Numerisch: Midpoint (lo+hi)/2, auf sinnvolle Präzision gerundet
   → Kategorisch: modales Top-K. Mehrere Werte mit gleichem Pfad-Effekt als
     "Äquivalenzklasse" in Test-Kommentar dokumentieren
   → Boolean: wie im Bucket

4. Segment-Charakterisierung
   → enrichment_auto_resolve → Szenario-Name ("Enterprise + multi-currency")

5. Scaffolding generieren
   → Eine @Test-Methode pro Szenario, mit Kommentar-Block: Share-%, Segment,
     Quell-Bucket

6. Report zusammenbauen
```

## Beispiel-Ausgabe (gekürzt, gegen den `loanApproval`-Seed)

````markdown
# Test scenarios from production: `loanApproval` (last 30d)

## Coverage summary

| Scenario            | Share | Segment            | Why included                                        |
| ------------------- | ----- | ------------------ | --------------------------------------------------- |
| Small loan approved | 42%   | PRIVATE / EUR      | Teil des dominanten Pfads                           |
| Small loan rejected | 16%   | PRIVATE / EUR      | ≥ 5% share                                          |
| Mid-range rejected  | 22%   | BUSINESS / EUR     | ≥ 5% share, eskalierte Fehlerrate in der Buggy-Era  |
| Enterprise approved | 9%    | ENTERPRISE / mixed | ≥ 5% share + segment-spezifischer Bonus             |
| FAX channel (rare)  | 0.5%  | BUSINESS / FAX     | Unter minBucketSize — **nicht** als Test abgebildet |

## Suppressed

1 Pfad (FAX-Kanal) suppressed by `minBucketSize=10`. Nicht als Test abgebildet.

## Generated tests

```java
@Test
@Deployment(resources = "loanApproval.bpmn")
void scenario_small_loan_approved() {
    // Path share in production (last 30d): 42%
    // Segment: PRIVATE / EUR
    // Source buckets: amount in [1000, 25000), customerSegment="PRIVATE", currency="EUR"
    Map<String, Object> vars = Map.of(
        "amount", 12000,
        "applicant", "Test Applicant",
        "loanType", "personal",
        "customerSegment", "PRIVATE",
        "currency", "EUR",
        "channel", "ONLINE"
    );
    ProcessInstance pi = runtimeService()
        .startProcessInstanceByKey("loanApproval", vars);
    // Check-the-request task completed with approved=true
    assertThat(pi).isWaitingAt("Task_0dfv74n");
    complete(task(pi), Map.of("approved", true));
    assertThat(pi)
        .hasPassed("Task_0dfv74n", "Gateway_approved")
        .isWaitingAt("Task_bankTransfer");
}

@Test
@Deployment(resources = "loanApproval.bpmn")
void scenario_enterprise_approved() {
    // Path share in production (last 30d): 9%
    // Segment: ENTERPRISE / mixed currency
    // Source buckets: amount in [250000, 500000), customerSegment="ENTERPRISE"
    // Equivalenzklasse currency: {EUR, USD, GBP}
    Map<String, Object> vars = Map.of(
        "amount", 320000,
        "applicant", "Test Enterprise",
        "loanType", "business",
        "customerSegment", "ENTERPRISE",
        "currency", "USD",
        "channel", "ONLINE"
    );
    ProcessInstance pi = runtimeService()
        .startProcessInstanceByKey("loanApproval", vars);
    complete(task(pi), Map.of("approved", true));
    assertThat(pi)
        .hasPassed("Task_0dfv74n", "Gateway_approved")
        .isWaitingAt("Task_bankTransfer");
}
```

## Caveats

- Values are bucket representatives, not real production values.
- Period: 30d. Re-run the skill quarterly to refresh the coverage.
- Enrichment availability: yes (see `enrichment.example.yaml` im cibseven-example).
````

## Kontext-Politik

- **Aggregate only — kein Instance-Fetch-Pfad.** Selbst wenn eine "echte"
  Instanz das Szenario realistischer machen würde, greift der Skill nicht
  darauf zu. Das ist _Design_, nicht Versehen.
- Die Testwerte sind **Repräsentanten**: Midpoint eines numerischen Buckets,
  modales Top-K eines kategorischen Buckets. Sie liegen im gleichen Bucket wie
  Produktion, wurden aber nie in Produktion gesehen.
- Weil nie Rohwerte die Tenant-Grenze überqueren, **braucht UC4 keinen
  Pseudonymisierungs-Helfer**. Das ist die architektonische Entscheidung, die
  T6′ aus dem kritischen Pfad genommen hat.

## Wann _nicht_ einsetzen

- Wenn das Testziel echte Referenzwerte mit referenzieller Integrität über
  mehrere Variablen verlangt (z.B. Rechnungs-/Lieferdatensätze, die
  aufeinander verweisen müssen) — dafür braucht es einen separaten
  Pseudonymisierungs-Fluss, der heute bewusst nicht gebaut ist.
- Als Ersatz für Fachkonzept-Reviews — der Skill reflektiert nur Produktions-
  _Realität_, nicht Produktions-_Soll_. Pfade, die nie hätten passieren dürfen,
  werden unkritisch als Szenarien vorgeschlagen.
