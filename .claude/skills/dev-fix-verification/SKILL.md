---
name: dev-fix-verification
argument-hint: "<deploymentId> [processDefinitionKey] [elementId] [windowDays]"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Verify whether a shipped fix actually moved the metric. Use when the user asks "did my fix work?", "hat das deployment was gebracht?", "post-deploy check", "verify rollout", or wants pre/post deployment evidence that a bug was actually closed. Pulls the deployment timestamp from camunda7, runs analytics.cluster.compare around it, and produces a verdict — IMPROVED / UNCHANGED / REGRESSED / INSUFFICIENT-SIGNAL — with the metric deltas and suppression caveats.
---

# Skill: dev-fix-verification (UC5)

After a deployment, **prove (or disprove) that the fix actually moved
production behavior**. The audience is a developer who just shipped a
change and wants evidence — not vibes — that the bug closed.

The point of this skill is to convert "looks fine in cockpit" into a
quantified before/after verdict the dev can paste into the ticket.

## IMPORTANT — context policy

- **Aggregates only.** Counts, rates, percentiles, deltas — never named
  instances or customers in the verdict.
- Use the `cluster.compare` `suppressed` flag as the authoritative signal
  for "not enough data yet". Do not override it by hand.
- A fix that looks improved but sits on a suppressed bucket is
  **inconclusive**, not improved.
- Quote git metadata (commit hash, deployment ID, timestamps) verbatim.
  Do not quote variable values.

## Inputs

Parse `$ARGUMENTS`:

- **`<deploymentId>`** — required. The Camunda deployment ID. The dev
  usually knows this (or has the commit hash and uses
  `camunda7_list_deployments` to find it; if they only have a commit, ask
  for the deployment ID before continuing).
- **`processDefinitionKey`** — optional. Restrict analysis to one process.
  If omitted, the comparison runs across all processes affected by the
  deployment.
- **`elementId`** — optional. Restrict the incident-rate side of the
  comparison to one BPMN element (e.g., the failing service task).
- **`windowDays`** — optional, defaults to **7**. Pre and post window in
  days. Use the same value for both sides; clamp to `1..90`.

If the deployment ID is missing, ask the user for it (one question only).

## Instructions

### Step 1 — Fetch deployment timestamp

Call `camunda7_get_deployment` with `id: <deploymentId>`. Extract:

- `deploymentTime` — this is the **anchor timestamp** for the comparison.
- `name`, `source` — useful context for the verdict.

If the call fails or the deployment is not found, stop and surface the
error. Do not fabricate a timestamp.

### Step 2 — Establish window viability

Compute `now() - deploymentTime`. If the post-deployment age is **< 1
day**, warn the user that the verdict will be "INSUFFICIENT-SIGNAL"
regardless of metric movement, and ask whether to proceed anyway.

### Step 3 — Run pre/post comparison

Call `analytics_cluster_compare`:

```
deploymentTimestamp: <deploymentTime from Step 1>
processDefinitionKey: <key, if provided>
elementId: <elementId, if provided>
windowBeforeDays: <windowDays>
windowAfterDays: <windowDays>
minBucketSize: 10
```

The result includes `kpis` (before/after) and `delta` (per-metric pp / %
change). Read both — the absolute KPIs anchor the deltas in reality.

### Step 4 — Classify the verdict

Apply this decision table:

| Condition                                                                           | Verdict                 |
| ----------------------------------------------------------------------------------- | ----------------------- |
| `suppressed: true`                                                                  | **INSUFFICIENT-SIGNAL** |
| Failure rate Δ ≤ −2pp **or** incident rate Δ ≤ −2pp (and the other did not regress) | **IMPROVED**            |
| Failure rate Δ ≥ +2pp **or** incident rate Δ ≥ +2pp **or** p95 duration Δ ≥ +25%    | **REGRESSED**           |
| Otherwise                                                                           | **UNCHANGED**           |

The thresholds (2pp, 25%) are intentionally coarse — fine-grained noise
near the boundary should not be reported as a definitive movement. If the
user gave a tighter target (e.g. "we expect failure rate to drop from
8% to under 1%"), use their threshold instead and quote it.

### Step 5 — Compose the verdict

```markdown
# Fix verification: deployment `<deploymentId>`

## Verdict

**<IMPROVED | UNCHANGED | REGRESSED | INSUFFICIENT-SIGNAL>**

<one-sentence summary in plain language, e.g. "Failure rate dropped from
8.2% to 0.4% on element `validateOrder` of `OrderApprovalProcess`.">

## Deployment

- ID: `<deploymentId>`
- Timestamp: `<deploymentTime>`
- Name / source: <if present>
- Window: ±<windowDays> days

## KPIs

| Metric        | Before | After | Δ   |
| ------------- | ------ | ----- | --- |
| Instances     | …      | …     | …   |
| Failure rate  | …%     | …%    | …pp |
| Incident rate | …%     | …%    | …pp |
| Avg duration  | …s     | …s    | …%  |
| P95 duration  | …s     | …s    | …%  |

## Caveats

- Suppressed: <true/false>. If true: which window had < minBucketSize.
- Window age: <e.g. "post-window only 3 of 7 days complete">.
- Scope: process=<key or "all">, element=<id or "all">.

## Recommendation

1–2 sentences: close the ticket / wait N more days for signal / roll back.
```

### Step 6 — Optional: render the widget

If the user is in a UI-capable host, also call
`analytics_show_cluster_compare` with the same arguments so they get the
visual side-by-side. Cite the textual verdict as authoritative — the
widget is a presentation aid.

### Step 7 — Hand off

Print the verdict block. Do **not** paste it into the ticket / PR
yourself unless the user explicitly asks. The dev decides what to do with
the evidence.
