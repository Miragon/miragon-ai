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

Examples (against the `miraveloLeasing` seed):

```
/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/delegates/CheckCreditScoreDelegate.kt:22
/dev-change-impact "lift the credit-score threshold from 550 to 600"
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
   → "Mostly PRIVATE + BRANCH intake"

7. Emit the one-pager
```

## Example output (truncated, against the seed)

```markdown
# Impact: CheckCreditScoreDelegate.kt:22 — lift credit-score threshold 550 → 600

## Change

- Old: `creditScore < 550 → throw BpmnError("BAD_CREDIT_SCORE")`
- New: `creditScore < 600 → throw BpmnError("BAD_CREDIT_SCORE")`
- Variable: `creditScore` (numeric, 300..850)
- Element: `Activity_CheckCreditScore` ("Check Credit Score") of `assessCreditworthiness`

## Projected reclassification (last 30d)

- Element fired **580 times** in the window (seed-scaled; one hit per parent
  instance that reaches the sub-process).
- **~41 instances (7.1%)** would be reclassified from "creditworthy" to
  "risk identified" under the new logic — all in the bucket `[550, 600)` of
  the creditScore distribution.
- Direction: **more** instances flow into the `Event_RiskIdentified` "Risk identified"
  branch, which surfaces the `Activity_DecideOnApplication` "Decide on application" user
  task in the parent process.

## Affected segments

`creditScore ∈ [550, 600)` is roughly 45% PRIVATE, 40% BUSINESS, 15% STUDENT
in the seed. The shift therefore hits PRIVATE and BUSINESS applicants almost
equally; STUDENT instances are under-represented because the lease amount cap
correlates loosely with credit score.

## Side observations

- `Activity_CheckCreditScore` today: 0.3% fail (a handful of stub-delegate errors),
  avg 28ms, p95 84ms — the check itself is not the bottleneck.
- Suppressed buckets near the boundary: `[600, 610)` has only 7 observations —
  flagged, not extrapolated.

## Recommendation

Confirm with the business before shipping: 41 additional applications per
month would be routed to the manual "Decide on application" task — check that
the decision desk has capacity before the deploy.
```

## Second presentation example: categorical condition (`seed-presentation`)

Beyond the numeric `creditScore` example above, the `seed-presentation`
profile stages categorical (`region`, `bikeModel`, `customerSegment`) and
boolean (`priorityFlag`) conditions.

```
/dev-change-impact "route APAC instances through the BUSINESS policy template instead of the default"
```

Expected output shape (truncated):

```markdown
# Impact: re-route APAC region to BUSINESS policy template

## Change

- Old: all instances use the default policy template in `Activity_DeliverPolicy`
  ("Delivery bike leasing policy")
- New: `region == "APAC"` → BUSINESS template, others unchanged
- Variable: `region` (categorical, top-K: EU / US / APAC)
- Element: `Activity_DeliverPolicy` of `miraveloLeasing`

## Projected reclassification (last 30d)

- Element fired **~550 times** in the window (one hit per approved policy).
- **~180 instances (33%)** would render with the BUSINESS template instead.
- Direction: shifts template selection for the APAC bucket only; other
  regions are unchanged.

## Affected segments

APAC instances concentrate in BUSINESS (~45%) and PRIVATE (~50%), with STUDENT
under-represented (~5%). Enrichment flags APAC as a non-GDPR region; confirm
the BUSINESS template contains no EU-only compliance boilerplate before
shipping.
```

For the boolean demo, invoke with `"default priorityFlag to true for
customerSegment=BUSINESS"` — the projection then runs on
`analytics_variable_distribution` over `priorityFlag × customerSegment`.

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
