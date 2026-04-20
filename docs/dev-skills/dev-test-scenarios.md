# UC4 — `dev-test-scenarios-from-production`

> "My fixtures are all made up. Give me test scenarios that reflect the real
> combinatorics from production — without me touching real customer data."

## Scenario

The developer has been writing synthetic test fixtures for days and notices
they don't hit the interesting combinations from production. "Cross-border
Enterprise with partial delivery" is a scenario nobody invents from memory —
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
   → enrichment_auto_resolve → scenario name ("Enterprise + multi-currency")

5. Generate scaffolding
   → one @Test method per scenario, with comment block: share %, segment,
     source bucket

6. Assemble the report
```

## Example output (truncated, against the `loanApproval` seed)

````markdown
# Test scenarios from production: `loanApproval` (last 30d)

## Coverage summary

| Scenario            | Share | Segment            | Why included                                        |
| ------------------- | ----- | ------------------ | --------------------------------------------------- |
| Small loan approved | 42%   | PRIVATE / EUR      | Part of the dominant path                           |
| Small loan rejected | 16%   | PRIVATE / EUR      | ≥ 5% share                                          |
| Mid-range rejected  | 22%   | BUSINESS / EUR     | ≥ 5% share, escalated failure rate in the buggy era |
| Enterprise approved | 9%    | ENTERPRISE / mixed | ≥ 5% share + segment-specific bonus                 |
| FAX channel (rare)  | 0.5%  | BUSINESS / FAX     | Below minBucketSize — **not** mapped to a test      |

## Suppressed

1 path (FAX channel) suppressed by `minBucketSize=10`. Not mapped to a test.

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
    // Equivalence class currency: {EUR, USD, GBP}
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
- Enrichment availability: yes (see `enrichment.example.yaml` in the cibseven-example).
````

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
