# UC4 — `dev-test-scenarios-from-production`

> "My fixtures are all made up. Give me test scenarios that reflect the real
> combinatorics from production — without me touching real customer data."

## Scenario

The developer has been writing synthetic test fixtures for days and notices
they don't hit the interesting combinations from production. "Cross-region
BUSINESS with a cargo lease" is a scenario nobody invents from memory —
but production sees it daily. The skill generates **real test scenarios from
the top paths + variable distributions**, including runnable JUnit or
Camunda BPM-Assert scaffolding.

## Invocation

```
/dev-test-scenarios-from-production <processDefinitionKey> [period: 7d|30d|90d] [framework: junit|bpm-assert]
```

- `processDefinitionKey` — required.
- `period` — optional, default `30d`.
- `framework` — optional, default `bpm-assert` (reads more naturally for
  process tests than plain JUnit).

## Tools involved

| Step                    | Tool                              | Server                      |
| ----------------------- | --------------------------------- | --------------------------- |
| Top paths               | `analytics_path_frequency`        | `analytics-mcp`             |
| Failure cross-reference | `analytics_element_bottleneck`    | `analytics-mcp`             |
| Variable distribution   | `analytics_variable_distribution` | `analytics-mcp`             |
| Segment naming          | `enrichment_auto_resolve`         | `enrichment-mcp` (optional) |

## Workflow

```
1. Top paths
   → analytics_path_frequency, limit=20, minBucketSize=10
   → choose scenarios:
     • dominant path (>=50%) → "Happy Path"
     • all paths >=5% → "Variants"
     • paths >=1% with elevated failure / incident rate → "Edge case worth a test"
   → cap at ~6 scenarios (more is overkill for the dev to maintain)

2. Variable distributions
   → for each scenario, identify the gateway variables (from BPMN/delegate
     code or a one-time question to the user)
   → analytics_variable_distribution per variable

3. Pick a representative value per bucket
   → numeric: midpoint (lo+hi)/2, rounded to a reasonable precision
   → categorical: modal top-K. Multiple values with the same path effect
     get documented as an "equivalence class" in a test comment
   → boolean: as in the bucket

4. Segment characterization
   → enrichment_auto_resolve → scenario name ("BUSINESS + APAC")

5. Generate scaffolding
   → one @Test method per scenario, with comment block: share %, segment,
     source bucket

6. Assemble the report
```

## Example output (truncated, against the `miraveloLeasing` seed)

````markdown
# Test scenarios from production: `miraveloLeasing` (last 30d)

## Coverage summary

| Scenario                     | Share | Segment        | Why included                                   |
| ---------------------------- | ----- | -------------- | ---------------------------------------------- |
| Creditworthy → policy issued | 92%   | PRIVATE / EU   | Dominant path                                  |
| Risk identified → positive   | 5.6%  | BUSINESS / EU  | ≥ 5% share, manual-decision surface            |
| Risk identified → negative   | 2.4%  | PRIVATE / APAC | ≥ 1% share, distinct terminal event            |
| BRANCH intake (rare)         | 2.0%  | BUSINESS / EU  | ≥ 1% share, categorical equivalence class      |
| FAX channel (suppressed)     | 0.8%  | BUSINESS / FAX | Below minBucketSize — **not** mapped to a test |
| Decision accelerated (timer) | 0.5%  | any / APAC     | Below minBucketSize — **not** mapped to a test |

## Suppressed

2 paths (FAX channel, Decision accelerated via timer) suppressed by
`minBucketSize=10`. Not mapped to a test.

## Generated tests

```java
@Test
@Deployment(resources = {"miravelo-leasing.bpmn", "miravelo-creditworthiness.bpmn"})
void scenario_creditworthy_policy_issued() {
    // Path share in production (last 30d): 92%
    // Segment: PRIVATE / EU
    // Source buckets: creditScore in [700, 850), region="EU",
    //                 bikeModel="city", leaseAmount in [800, 2500),
    //                 leaseTermMonths=24, customerSegment="PRIVATE"
    Map<String, Object> vars = Map.of(
        "customerId", "CUST-TEST-1",
        "creditScore", 760,
        "postalCode", "10115",
        "region", "EU",
        "bikeModel", "city",
        "leaseAmount", 1500,
        "leaseTermMonths", 24,
        "customerSegment", "PRIVATE",
        "channel", "ONLINE",
        "priorityFlag", false
    );
    ProcessInstance pi = runtimeService()
        .startProcessInstanceByKey("miraveloLeasing", vars);
    assertThat(pi)
        .hasPassed("Activity_ResolveCustomer", "Activity_AssessCreditworthiness", "Activity_SendPolicy")
        .isEnded()
        .hasPassed("Event_PolicyIssued");
}

@Test
@Deployment(resources = {"miravelo-leasing.bpmn", "miravelo-creditworthiness.bpmn"})
void scenario_risk_identified_positive_decision() {
    // Path share in production (last 30d): 5.6%
    // Segment: BUSINESS / EU
    // Source buckets: creditScore in [300, 550) → BAD_CREDIT_SCORE,
    //                 bikeModel="trail", leaseAmount in [6000, 12000),
    //                 customerSegment="BUSINESS"
    // Equivalence class bikeModel: {city, trail, road} (cargo excluded — see UC6 DEAD)
    Map<String, Object> vars = Map.of(
        "customerId", "CUST-TEST-2",
        "creditScore", 510,
        "region", "EU",
        "bikeModel", "trail",
        "leaseAmount", 8500,
        "leaseTermMonths", 36,
        "customerSegment", "BUSINESS",
        "channel", "ONLINE",
        "priorityFlag", true
    );
    ProcessInstance pi = runtimeService()
        .startProcessInstanceByKey("miraveloLeasing", vars);
    // Sub-process surfaces "Risk identified" → parent routes to the
    // "Decide on application" user task.
    assertThat(pi).isWaitingAt("Activity_DecideOnApplication");
    complete(task(pi), Map.of("decision", "positive"));
    assertThat(pi)
        .hasPassed("Activity_SendPolicy", "Activity_DeliverPolicy")
        .isEnded()
        .hasPassed("Event_PolicyIssued");
}
```

## Caveats

- Values are bucket representatives, not real production values.
- Period: 30d. Re-run the skill quarterly to refresh the coverage.
- Enrichment availability: yes (see `enrichment.example.yaml` in the
  cibseven-example).
````

## Second presentation example (framework=junit)

Running UC4 with `junit` (instead of `bpm-assert`) inlines the full
`RuntimeService` + `TaskService` plumbing, which some teams prefer for CI
integration with Spring context beans. The scenario coverage is the same.

```
/dev-test-scenarios-from-production miraveloLeasing 30d junit
```

## Context policy

- **Aggregates only — no instance-fetch path.** Even if a "real" instance
  would make the scenario more realistic, the skill does not reach for one.
  That is _by design_, not an oversight.
- The test values are **representatives**: midpoint of a numeric bucket,
  modal top-K of a categorical bucket. They sit in the same bucket as
  production but were never seen in production.
- Because raw values never cross the tenant boundary, **UC4 does not require a
  pseudonymization helper**. That is the architectural decision that took T6′
  off the critical path.

## When _not_ to use it

- When the test goal demands real reference values with referential
  integrity across multiple variables (e.g. invoice/delivery records that
  must reference each other) — that needs a separate pseudonymization flow,
  which is intentionally not built today.
- As a substitute for business-concept reviews — the skill only reflects the
  production _reality_, not the production _target_. Paths that should never
  have happened are uncritically proposed as scenarios.
