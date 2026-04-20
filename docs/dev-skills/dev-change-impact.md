# UC2 — `dev-change-impact`

> "I want to lift this threshold from 10,000 to 20,000. How many instances
> would be classified differently — and _who_ are they?"

## Scenario

A developer is about to commit: she wants to adjust a threshold, a gateway
condition, or an `in(...)` list. Before deploying she wants to know how many
instances over the last 30 days the new logic would have routed differently —
and which customer segments would be affected. The skill produces a
**one-pager for the decision**: ship as-is, or get business sign-off first.

## Invocation

```
/dev-change-impact <file>:<line>
/dev-change-impact "<free-form description of the change>"
```

Examples (against the `loanApproval` seed):

```
/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/TestDataSeeder.kt:194
/dev-change-impact "lift auto-approval amount threshold from 25000 to 50000"
```

## Tools involved

| Step                     | Tool                                | Server                      |
| ------------------------ | ----------------------------------- | --------------------------- |
| Anchor the change        | `Read`, `Grep`, `Glob`              | Workspace                   |
| Find BPMN element        | `Grep` over `*.bpmn` + delegate FQN | Workspace                   |
| Element traffic          | `analytics_element_bottleneck`      | `analytics-mcp`             |
| Variable distribution    | `analytics_variable_distribution`   | `analytics-mcp`             |
| Segment characterization | `enrichment_auto_resolve`           | `enrichment-mcp` (optional) |

## Workflow

```
1. Anchor the change
   → read file + line, extract variable + old predicate + new predicate
   → record delegate FQN

2. Resolve the BPMN element
   → grep *.bpmn for delegate FQN / delegateExpression
   → determine processDefinitionKey and elementId

3. Pull the baseline
   → analytics_element_bottleneck returns hits, failure rate, durations

4. Pull the variable distribution
   → analytics_variable_distribution with 20 buckets (numeric) or
     topK=20 (categorical)

5. Compute the projection
   → apply old predicate vs. new predicate to the distribution
   → reclassification count + share + direction

6. Segment characterization
   → enrichment_auto_resolve with a representative boundary value
   → "Mostly Mid-Market with multi-currency"

7. Emit the one-pager
```

## Example output (truncated, against the seed)

```markdown
# Impact: TestDataSeeder.kt:194 — lift threshold 25000 → 50000

## Change

- Old: `amount < 25_000 → base approval = 0.85`
- New: `amount < 50_000 → base approval = 0.85`
- Variable: `amount` (numeric)
- Element: `Gateway_approved` of `loanApproval` (exclusiveGateway)

## Projected reclassification (last 30d)

- Gateway fired **140 times** in the window (seed-scaled).
- **22 instances (22/140 = 15.7%)** would be classified differently under the
  new logic — all in the bucket `[25000, 50000)` with currently ~65% approval,
  ~85% in future.
- Direction: **more** instances flow into the approval branch.

## Affected segments

`[25000, 50000)` is roughly 30% PRIVATE, 55% BUSINESS, 15% ENTERPRISE in the
seed. The shift therefore mainly hits Business customers with mid-range
loan amounts.

## Side observations

- `Gateway_approved` today: 0% fail, avg 1ms, p95 3ms — the gateway itself is
  not the bottleneck.
- Suppressed buckets near the boundary: `[45000, 50000)` — only 8 observations.

## Recommendation

Confirm with the business before shipping: 22 additional instances per seed
cycle would be auto-approved without extra review — that may or may not be
intended. Enterprise stays largely unaffected because of the segment bonus.
```

## Context policy

- Code, predicates, element IDs: quoted verbatim.
- Variable values: not quoted. The skill reports only counts, shares, and
  bucket ranges.
- Suppressed buckets near the boundary are flagged explicitly and **not**
  treated as 0 or full — the report is then "uncertain", not "zero impact".

## When _not_ to use it

- For pure code refactorings without behavior change — the skill returns 0%
  reclassified and is noise.
- When the change introduces a brand-new variable that was not previously
  written — `variable.distribution` then has no history, projection is
  impossible.
