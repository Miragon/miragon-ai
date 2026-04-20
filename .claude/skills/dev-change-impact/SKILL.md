---
name: dev-change-impact
argument-hint: '<file>:<line> | "<condition or threshold change>"'
allowed-tools: Bash(git *), Read, Grep, Glob
description: Pre-flight impact analysis before a code change ships. Use when the user asks "what happens if I change this?", "should I raise this threshold?", "wieviele Instanzen wären betroffen?", "impact of this change", or wants a fachliche projection of a delegate / condition / threshold edit before committing it. Combines variable distribution, element frequency, and enrichment to project how many of the last N instances would have been classified differently — and which customer segments are affected.
---

# Skill: dev-change-impact (UC2)

Project the **business impact of a code change before it ships**. The
audience is a developer about to alter a delegate, a gateway condition,
or a threshold — and who wants to know "what does this actually do to
production?" before the deploy.

The point of this skill is **decision support**, not code review. The
output is a one-pager that lets the dev either confidently ship the
change, or pause and renegotiate it with the business.

## IMPORTANT — context policy

- **Aggregates only.** Counts, distributions, segment shares — never
  named instances, customers, or order numbers in the report.
- Use `minBucketSize` (default 10) on all analytics calls.
- The simulation result is a **projection**, not a guarantee. State the
  window the projection is based on, and surface every caveat (suppressed
  buckets, time skew, missing variables).
- Quote code, condition syntax, and element IDs verbatim. Do not quote
  variable values.

## Inputs

Parse `$ARGUMENTS`:

- **`<file>:<line>`** — the suspect line. The skill reads surrounding
  context to identify the variable, predicate, and current threshold /
  branch logic.
- **OR a free-form description** — e.g. `"raise approval threshold from 10000 to 20000 in OrderValidator"`. Use `Grep` to find the matching line.

If the change parameters (old value → new value, or new branch logic) are
ambiguous, ask the user for one targeted clarification. Do not guess
threshold deltas.

## Instructions

### Step 1 — Anchor the change

Read the file around the target line. Extract:

- The **variable** being read (`execution.getVariable("orderTotal")`,
  `${order.total}`, etc.). This is the key for `variable.distribution`.
- The **current predicate** (`> 10000`, `== "FAX"`, `compareTo(LIMIT) > 0`).
- The **proposed new predicate** (from the user input). If the user gave
  a free-form description, restate the change explicitly and show it back
  before continuing.
- The enclosing **delegate / listener class** (FQN).

### Step 2 — Resolve to a BPMN element

`Grep` `*.bpmn` files for the delegate FQN or the matching
`delegateExpression`. Record `processDefinitionKey` and `elementId`. If
multiple processes use the delegate, list them and run Steps 3–5 once per
process (most code only has one caller — common case is single).

### Step 3 — Element traffic baseline

Call `analytics_element_bottleneck` (or `analytics_path_frequency` if
bottleneck has no entry):

```
processDefinitionKey: <key>
period: 30d
minBucketSize: 10
```

Extract for the target element:

- Hits per period (the denominator for the impact projection).
- Failure rate, avg/p95 duration (so the dev sees if the element is also
  slow / failing today — different conversation).

### Step 4 — Variable distribution

Call `analytics_variable_distribution`:

```
variableName: <variable from Step 1>
processDefinitionKey: <key>
period: 30d
minBucketSize: 10
numericBuckets: 20      # if the variable is numeric
topK: 20                # if the variable is categorical
```

This gives you the actual histogram / value distribution of the variable
the predicate reads — over the same window as the baseline.

### Step 5 — Project the change

Apply the **new predicate** to the distribution from Step 4 and compare
against the **old predicate**. Compute:

- **Reclassified count**: how many of the N observations from Step 4 would
  fall on the other side of the new predicate vs. the old one.
- **Reclassified share**: that count as a % of the element's hits from
  Step 3.
- **Direction**: are more instances entering the gated branch, or fewer?

For non-numeric predicates (e.g., adding a new value to an `in (...)`
list), count the matching buckets directly.

If a bucket is suppressed and overlaps the predicate boundary, **flag it
as uncertain** rather than assuming zero or full.

### Step 6 — Segment characterization

Call `enrichment_auto_resolve` with the variable name and a representative
boundary value (e.g., the new threshold, or one of the new categorical
values). Use the resolved bounded-context info to characterize **who**
gets reclassified.

If enrichment is not configured, skip and say so.

### Step 7 — Produce the impact one-pager

```markdown
# Impact: <file>:<line> — <short label of the change>

## Change

- Old: `<predicate>`
- New: `<predicate>`
- Variable: `<name>` (numeric / categorical)
- Element: `<id>` of `<key>` (`<bpmn-type>`, delegate `<FQN>`)

## Projected reclassification (last 30d)

- Element fired **N times** in the window.
- **M instances (M/N = X%)** would have been classified differently
  under the new predicate.
- Direction: <more/fewer> instances enter the gated branch.

## Affected segments

<segment characterization from enrichment, e.g. "Mostly Mid-Market with
multi-currency orders"; or "Enrichment not configured — manual segment
review needed.">

## Side observations

- Element today: <fail %>%, avg <X>s, p95 <Y>s — <one line if relevant>
- Suppressed buckets near the boundary: <list, if any>

## Caveats

- Window: 30d. If the upcoming period has different seasonality, the
  projection will drift.
- Suppressed buckets cannot be projected — flagged above.
- Enrichment availability: <yes / no>

## Recommendation

1–2 sentences: ship as-is / get business sign-off / pause and recheck.
Be specific about _which_ group is affected, not just "some users".
```

### Step 8 — Hand off

Print the one-pager. Do **not** save to a file unless asked. If the user
decides to ship, hand back to them — this skill does not commit, deploy,
or open a PR.
