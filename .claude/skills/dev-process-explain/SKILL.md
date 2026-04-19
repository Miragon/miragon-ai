---
name: dev-process-explain
argument-hint: "<processDefinitionKey> [period: 1d|7d|30d|90d]"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Reverse-engineer a Camunda process behaviorally for a developer onboarding to it. Use when the user asks "explain process X", "onboard me to process X", "what does process X actually do in production?", or wants a behavior-first overview of an unfamiliar BPMN. Combines BPMN structure, delegate code, path-frequency analytics, element bottlenecks, and enrichment to produce an onboarding doc grounded in real runtime behavior — not just code reading.
---

# Skill: dev-process-explain (UC1)

Produce a **behavior-first onboarding document** for a Camunda 7 process
definition. The audience is a developer who has to ship a feature in this
process but did not write it.

The point of this skill is not to summarize the BPMN — anyone can read the
diagram. The point is to ground the explanation in **what actually happens
at runtime**: which paths matter, which elements are hot, which segments
take which branches.

## IMPORTANT — context policy

- **Aggregates only.** Never include individual instance IDs, customer
  names, order numbers, or raw variable values in the onboarding doc.
- Use the analytics tools' `minBucketSize` (default 10) to suppress rare
  buckets. Do not hand-aggregate around it.
- If a query returns `suppressed: true` or empty results for a chosen
  window, say so — do not invent a story.
- Code, BPMN structure, delegate class names, and element IDs are fine to
  quote verbatim. Variable values are not.

## Inputs

Parse `$ARGUMENTS`:

- **`<processDefinitionKey>`** — required. The Camunda process definition key
  (e.g. `OrderApprovalProcess`).
- **`period`** — optional, one of `1d|7d|30d|90d`. Default `30d`.

If the key is missing, ask the user (one question only) which process they
want explained.

## Instructions

### Step 1 — Pull BPMN structure

Call `camunda7_get_process_definition_xml` with the key. From the XML,
extract:

- Start events, end events, intermediate events
- Service tasks and their `camunda:class` / `camunda:delegateExpression`
- User tasks and their assignee/candidate-group expressions
- Gateways (exclusive / inclusive / parallel) and their condition expressions
- Listeners (`camunda:executionListener`, `camunda:taskListener`)

Note the **element IDs** — every later analytics call uses them.

### Step 2 — Read the delegate code (local)

For each delegate / listener class identified in Step 1, locate the source
file in the current workspace using `Grep` / `Glob`. Read just enough to
understand the contract (inputs read, outputs written, side effects, error
modes). Do **not** dump the full files into the doc.

If a class cannot be found locally, note it as "external / not in workspace"
and move on — the analytics may still tell you whether that branch is alive.

### Step 3 — Path frequency

Call `analytics_path_frequency`:

```
processDefinitionKey: <key>
period: <period>
minBucketSize: 10
limit: 20
```

This gives you the top execution paths and their share. Identify:

- The dominant path (typically one path > 50%)
- Secondary paths (5–30%)
- Long-tail paths that survive `minBucketSize` (the interesting ones —
  rare but real)
- Anything `suppressed` (note it; do not extrapolate)

### Step 4 — Element bottlenecks

Call `analytics_element_bottleneck` with the same key and period. Identify:

- Elements with high duration (where the process waits)
- Elements with high failure rate (where it breaks)
- Elements with high frequency (the hot path elements)

Cross-reference with the BPMN to understand whether these are user tasks
(human latency), service tasks (integration latency), or gateways (logic
hot spots).

### Step 5 — Enrich a representative path

For the dominant path's terminal element (or any element the user names),
pick a small set of representative variables you observed in delegate code
or task forms. Call `enrichment_auto_resolve` with those variable names →
typical values. The result tells you which **bounded contexts** this
process touches (CRM segment, contract type, etc.) — that is the fachliche
characterization the dev needs.

If the workspace has no enrichment configured, skip this step and note it.

### Step 6 — Synthesize the onboarding doc

Produce a markdown document with these sections (omit any section that has
no signal):

```markdown
# Process: <key>

## TL;DR

1–3 sentences: what the process does + the dominant runtime path.

## Behavior in production (last <period>)

- Path A: <share>% — <one-line description in business terms>
- Path B: <share>% — <…>
- Long-tail / suppressed: <count>

## Where the time goes

- Element <id> (<bpmn-type>): avg <X>s, p95 <Y>s — <one line of why>
- …

## Where it breaks

- Element <id>: <failure rate>% — <delegate class> — <likely cause from code>
- …

## Segment characterization

What kinds of customers/orders/etc. take which path, from enrichment.
"Path B is almost exclusively Enterprise + multi-currency."

## Code map

| Element ID | Type | Class / expression | Notes |
| ---------- | ---- | ------------------ | ----- |

## Things a new dev should know

- Suppressed branches that may still matter
- Listeners that are easy to miss
- Variables read upstream that are not declared here
```

### Step 7 — Hand off

Print the document to the user. Do **not** save it to a file unless the
user explicitly asks. The doc is meant to live in the conversation and be
iterated on.
