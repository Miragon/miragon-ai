---
name: dev-code-archaeology
argument-hint: '<file>:<line> | "<condition or snippet>"'
allowed-tools: Bash(git *), Read, Grep, Glob
description: Answer "why does this code exist — and is it still needed?" by combining git history, BPMN element resolution, runtime path frequency over the last 12 months, and enrichment-based segment characterization. Use when the user asks "darf ich das löschen?", "warum ist das so?", "is this dead code?", "who still hits this branch?", or "code archaeology" on a suspect condition, delegate, or branch.
---

# Skill: dev-code-archaeology (UC6)

Empirically answer the classic "darf ich das löschen?" question for a
suspicious piece of business logic — usually a condition, a delegate
class, or a rarely-touched BPMN branch.

The goal is a **verdict grounded in runtime evidence**, not vibes:

- **alive** — N hits in the last 12 months, characterize who hits it.
- **dead** — zero hits, last activity older than retention horizon.
- **unknown** — retention or instrumentation gap; say so explicitly.

## IMPORTANT — context policy

- **Aggregates only.** Counts and segment characterizations, never named
  customers / orders / IDs in the verdict.
- Use `minBucketSize` (default 10) on analytics calls. If the bucket is
  suppressed, treat the branch as "low-volume but not provably dead" — do
  not round it down to zero.
- Quote git metadata (commit hash, author, date, ticket reference)
  verbatim. Quote code verbatim. Do **not** quote variable values.

## Inputs

Parse `$ARGUMENTS`:

- **`<file>:<line>`** — the suspect line. The skill will read surrounding
  context to identify the condition / branch / delegate.
- **OR `"<snippet>"`** — a condition or method name. The skill will grep
  for it.

If neither is provided, ask the user for one (single question).

## Instructions

### Step 1 — Anchor the suspect

Read the file around the target line (or grep for the snippet). Identify:

- The **enclosing function or method**. If it implements a Camunda
  delegate (`JavaDelegate`, `@Component` on `executionListener`,
  `@TaskListener`, etc.), record the class FQN.
- The **branch condition** (`if`/`switch`/`when`) — the actual logical
  predicate the user is asking about.
- Any variables read from the execution (`execution.getVariable("…")`,
  `delegateExecution`, `${expression}`).

### Step 2 — Resolve to a BPMN element

Find which BPMN element invokes this code:

- `Grep` the `*.bpmn` files in the workspace for the delegate class FQN
  (or the `delegateExpression` / `class` attribute that matches).
- Record `processDefinitionKey` and `elementId` for each match.

If multiple processes reference the same delegate, repeat Step 3 for each.

### Step 3 — Git history

Run:

```
git log --follow -p -- <file>     # full evolution of the file
git blame -L <line>,<line> <file> # who introduced this exact line
```

Extract for the suspect line:

- introducing commit hash, author, date
- ticket reference from the commit message (Jira/GitHub key)
- subsequent edits to the same line (renames, refactors)

This is your "what was the original intent?" anchor.

### Step 4 — Runtime hits over 12 months

Call `analytics_path_frequency`:

```
processDefinitionKey: <key from Step 2>
period: 90d            # call once per quarter and aggregate (see below)
minBucketSize: 10
limit: 50
```

`period` only supports `1d|7d|30d|90d`. To approximate 12 months, run the
`90d` call **once** as a proxy and state in the verdict that the window is
90 days, not 12 months. (If the user explicitly asks for 12 months and the
underlying retention is shorter, surface that as a caveat.)

From the result, count paths that **traverse `<elementId>` from Step 2**.
That is your hit count.

Also call `analytics_element_bottleneck` with the same key + period to
confirm the element appears in the index at all. If it does not appear
even with `minBucketSize: 1`, the branch is provably untouched in the
window.

### Step 5 — Segment characterization (alive case only)

If the count is non-zero, pick the variables read by the suspect code
(from Step 1) and call `enrichment_auto_resolve` with the variable names
and a representative value. Use the resolved bounded-context info
("LEGACY_B2B + FAX channel", "Enterprise + multi-currency", etc.) to
characterize **who** hits this branch.

If enrichment is not configured, skip and say so.

### Step 6 — Verdict

Produce a short, decisive markdown block:

```markdown
# Archaeology: <file>:<line> — `<short label>`

## Verdict

**ALIVE** — N hits in the last 90d at element `<id>` of `<key>`.
Characterized by: <segment phrase from enrichment>.
**Recommendation: do not remove.**

— or —

**DEAD** — 0 hits in the last 90d, element absent from the bottleneck
index even at minBucketSize=1.
**Recommendation: safe to remove behind a feature flag, or directly if
no rollback risk.**

— or —

**UNKNOWN** — bucket suppressed (< 10 hits) OR retention shorter than the
requested window. Need a longer window or a manual review before deleting.

## Origin

- Introduced in `<commit>` by <author> on <date> (ticket `<key>`)
- Last touched in `<commit>` on <date>

## Where it lives in the process

- Process `<key>`, element `<id>` (`<bpmn-type>`)
- Delegate / listener class `<FQN>`
- Variables read: `<v1>`, `<v2>`

## Caveats

- Window: <e.g. 90d, not 12 months as requested>
- Retention: <if relevant>
- Suppressed buckets: <list, if any>
```

### Step 7 — Hand off

Print the verdict block. Do not save it to a file unless asked. If the
user accepts the recommendation and asks for the deletion, hand back to
them — this skill does not edit code.
