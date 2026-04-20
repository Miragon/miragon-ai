---
name: dev-test-scenarios-from-production
argument-hint: "<processDefinitionKey> [period: 7d|30d|90d] [framework: junit|bpm-assert]"
allowed-tools: Read, Grep, Glob
description: Generate realistic test scenarios for a Camunda process from real production aggregates. Use when the user asks "generate tests from production", "Test-Szenarien aus Produktion", "what scenarios should I cover?", "give me realistic test data", or wants JUnit / Camunda-BPM-Assert scaffolding seeded by the actual path frequency, variable distributions, and enrichment segments observed in the last N days. Operates on aggregates only — never touches instance data, never needs pseudonymization.
---

# Skill: dev-test-scenarios-from-production (UC4)

Turn real production behavior into a **set of test scenarios with
scaffolding code**. The audience is a developer who needs realistic
edge-case coverage and is tired of writing synthetic fixtures that miss
the real Bounded-Context combinations.

The point of this skill is that the _combination_ of variable values is
what matters — "Cross-Border Enterprise with partial shipment" is a
scenario nobody invents from scratch, but production sees it every day.

## IMPORTANT — context policy & how this skill stays safe

- **This skill operates on aggregates only.** It never fetches an
  individual process instance, customer, or order. Every value in the
  generated tests is a representative picked from a `minBucketSize`-
  suppressed bucket (numeric midpoint, top-K string).
- **No pseudonymization is needed** — there is no real value to
  anonymize. If a value would be unique enough to identify a real entity,
  the bucket is suppressed and the skill skips it.
- **No instance-level fetch path.** Do not be tempted to "make it more
  realistic" by pulling one real instance — that defeats the entire
  privacy story. If a scenario is too vague, narrow the period or split
  by a discriminating variable, do not zoom in.

## Inputs

Parse `$ARGUMENTS`:

- **`<processDefinitionKey>`** — required.
- **`period`** — optional. One of `7d`, `30d`, `90d`. Default `30d`.
- **`framework`** — optional. One of `junit`, `bpm-assert`. Default
  `bpm-assert` (Camunda-BPM-Assert reads better for process tests).

If the key is missing, ask the user for it (one question only).

## Instructions

### Step 1 — Top paths

Call `analytics_path_frequency`:

```
processDefinitionKey: <key>
period: <period>
minBucketSize: 10
limit: 20
```

Pick the scenarios you will materialize:

- The **dominant path** (≥ 50%) → "Happy Path".
- All paths with `share ≥ 5%` → variants worth covering.
- All paths with `share ≥ 1%` that traverse an element with elevated
  failure / incident rate → "edge case worth a test". Cross-reference
  with `analytics_element_bottleneck` (same key + period) to find these.
- Anything `suppressed` is **not** a scenario. State it in the report.

Cap the total at ~6 scenarios. More than that is noise; the dev will not
maintain them.

### Step 2 — Variable distributions per path

For each scenario from Step 1, identify which variables drive the path
(typically the gateway condition variables). Ask the user once for the
list of relevant variable names if you cannot infer them from the BPMN /
delegate code in the workspace; otherwise infer.

For each variable, call `analytics_variable_distribution`:

```
variableName: <name>
processDefinitionKey: <key>
period: <period>
minBucketSize: 10
numericBuckets: 10     # for numerics
topK: 10               # for categoricals
```

Hold on to the buckets — these are the source of concrete test values.

### Step 3 — Pick a representative value per bucket

For each variable on each scenario, choose **one** concrete value:

- **Numeric bucket `[lo, hi)`** → midpoint, rounded to a sensible
  precision (`(lo + hi) / 2`). For very large buckets, pick a value
  inside the bucket that is unlikely to look like a real ID (avoid
  round-numbered "1000000" if the bucket is `[10, 1000000)`).
- **Categorical top-K** → the _modal_ value of the bucket the path
  selects. If multiple top-K values hit the same path (e.g. several
  countries all map to "Cross-Border"), keep one and note the others as
  equivalence-class members in the test comment.
- **Boolean** → `true` / `false` per the bucket.

These values are **representatives, not real values**. They land inside
the same bucket as production but were never present in production.

### Step 4 — Segment characterization (per scenario)

For each scenario, call `enrichment_auto_resolve` once with the
representative variables from Step 3. Use the resolved bounded-context
info to **name the scenario** ("Enterprise + multi-currency",
"Mid-Market + EU + standard SLA").

If enrichment is not configured, fall back to naming by the discriminating
variable values themselves and note the limitation.

### Step 5 — Generate the test scaffolding

For `framework: bpm-assert`, emit one Java method per scenario:

```java
@Test
@Deployment(resources = "<process>.bpmn")
void scenario_<slugified_name>() {
    // Path share in production (last <period>): <X>%
    // Segment characterization: <name from Step 4>
    Map<String, Object> vars = Map.of(
        "<v1>", <representative1>,
        "<v2>", <representative2>
    );
    ProcessInstance pi = runtimeService()
        .startProcessInstanceByKey("<key>", vars);
    assertThat(pi)
        .hasPassed("<expected element 1>", "<expected element 2>")
        .hasNotPassed("<element from another path>")
        .isEnded();
}
```

For `framework: junit`, emit a parameterized test or a plain `@Test`
without the `assertThat(pi)` DSL — same `vars` map and process start, but
assertions written against `historyService` queries.

Always include:

- A comment block at the top of each method showing share %, segment
  name, and the source bucket(s) the values came from.
- An import block at the file top with the standard
  `org.camunda.bpm.engine.test.assertions.bpmn.AbstractAssertions.*`
  static imports for bpm-assert, or `org.junit.jupiter.api.Test` for
  plain JUnit.

### Step 6 — Compose the report + scaffold

```markdown
# Test scenarios from production: `<key>` (last <period>)

## Coverage summary

| Scenario               | Share | Segment   | Why included                             |
| ---------------------- | ----- | --------- | ---------------------------------------- |
| Happy Path             | 78%   | <segment> | Dominant path                            |
| Enterprise variant     | 9%    | <segment> | ≥ 5% share                               |
| Cross-Border edge case | 0.6%  | <segment> | Elevated incident rate at element `<id>` |

## Suppressed

N paths suppressed by `minBucketSize=10`. Not represented in tests.

## Generated tests

\`\`\`java
<scaffold from Step 5 — one method per scenario>
\`\`\`

## Caveats

- Values are bucket representatives, not real production values.
- Period: <period>. Re-run the skill quarterly to refresh the coverage
  if production behavior drifts.
- Enrichment availability: <yes / no>.
```

### Step 7 — Hand off

Print the report + scaffold. Do **not** write the test file to disk
unless the user explicitly asks for the path. The dev decides where the
test lives; this skill only proposes the contents.
