# UC5 — `dev-fix-verification`

> "The deployment is through. The cockpit looks fine. But _did_ my fix move
> the metric?"

## Scenario

The fix is deployed, the ticket owner wants to close the ticket, the dev
wants evidence instead of feeling. The skill pulls the deployment timestamp
from Camunda, computes pre/post via `analytics_cluster_compare`, and emits a
clear verdict — **IMPROVED / UNCHANGED / REGRESSED / INSUFFICIENT-SIGNAL** —
with numbers that can be pasted into the ticket comment.

## Invocation

```
/dev-fix-verification <deploymentId> [processDefinitionKey] [elementId] [windowDays]
```

- `deploymentId` — required. If the dev only has the commit hash, they can
  use `camunda7_list_deployments` to look up the deployment ID.
- `processDefinitionKey` — optional, narrows the comparison to one process.
- `elementId` — optional, narrows the incident-rate side to a single element
  (e.g. the service task the fix touches).
- `windowDays` — optional, default `7`. Window before and after deployment
  (equal size, `1..90`).

## Tools involved

| Step                | Tool                             | Server          |
| ------------------- | -------------------------------- | --------------- |
| Deployment metadata | `camunda7_get_deployment`        | `camunda7-mcp`  |
| Pre/post comparison | `analytics_cluster_compare`      | `analytics-mcp` |
| Widget (optional)   | `analytics_show_cluster_compare` | `analytics-mcp` |

## Workflow

```
1. Pull the deployment timestamp
   → camunda7_get_deployment
   → deploymentTime is the anchor timestamp

2. Check window viability
   → if now() - deploymentTime < 1 day: warn, the verdict becomes
     "INSUFFICIENT-SIGNAL"

3. Compute the comparison
   → analytics_cluster_compare(deploymentTimestamp, windowBefore=N,
     windowAfter=N, minBucketSize=10)
   → kpis (before/after) + delta (per metric)

4. Classify the verdict
   → suppressed: true                                 → INSUFFICIENT-SIGNAL
   → failure_rate_delta <= -2pp OR incident_rate_delta <= -2pp
     (and the other one has not regressed)            → IMPROVED
   → failure_rate_delta >= +2pp OR incident_rate_delta >= +2pp
     OR p95_duration_delta >= +25%                    → REGRESSED
   → otherwise                                        → UNCHANGED

5. Emit the verdict block
```

## Example output (against the `loanApproval` seed)

The seeder marks the first of two 15-day blocks as the "pre-fix" era in
which `NotifyApplicantDelegate` throws a `RuntimeException` with 15%
probability and produces incidents. The cutoff in the middle of the window is
the simulated deployment timestamp.

```markdown
# Fix verification: deployment `loanApproval-seed-deploy`

## Verdict

**IMPROVED**

Failure rate dropped from 15.4% to 0.2% on element `Task_notifyApplicant` of
`loanApproval`.

## Deployment

- ID: `loanApproval-seed-deploy` (seed cutoff between buggy era and post-fix)
- Timestamp: `2026-04-04 00:00:00 UTC` (T0 - 15 days)
- Name / source: `loanApproval.bpmn` with the fixed delegate
- Window: ±7 days

## KPIs

| Metric        | Before | After | Δ       |
| ------------- | ------ | ----- | ------- |
| Instances     | 46     | 52    | +13.0%  |
| Failure rate  | 15.4%  | 0.2%  | -15.2pp |
| Incident rate | 13.0%  | 0.0%  | -13.0pp |
| Avg duration  | 48ms   | 42ms  | -12%    |
| P95 duration  | 260ms  | 110ms | -58%    |

## Caveats

- Suppressed: false (both windows above minBucketSize=10 instances).
- Window age: post-window complete (7 of 7 seed days).
- Scope: process=`loanApproval`, element=`Task_notifyApplicant`.

## Recommendation

Close the ticket. The fix pushed the failure rate down to practically zero
and halved the p95 duration — no signs of regressions in other metrics. The
remaining 0.2% comes from a single retry event the day after the cutoff.
```

## Second presentation example: REGRESSED verdict (`seed-presentation`)

The `seed-presentation` profile deliberately stages a **second** bug era on
`loanApproval` — a narrow band at days 7–10 ago (the "rollback era") where
`NotifyApplicantDelegate` throws at ~12%, bracketed by healthy rates before
and after. Pointing UC5 at a deployment whose timestamp centers on that band
produces a REGRESSED verdict instead of IMPROVED.

```
/dev-fix-verification <rollback-era-deployment-id> loanApproval Task_notifyApplicant 3
```

Pick the deployment whose timestamp sits around `now() - 8.5d` — the
deployment list from `camunda7_list_deployments` shows one on either side of
the rollback band; in the presentation seed the two relevant anchors are
labeled internally as `loanApproval-rollback-intro` and
`loanApproval-rollback-revert`.

Expected output shape (truncated):

```markdown
# Fix verification: deployment `loanApproval-rollback-intro`

## Verdict

**REGRESSED**

Failure rate on `Task_notifyApplicant` rose from 0.2% to 8.1% in the 3-day
window immediately after the rollout — matching the simulated regression band.

## KPIs

| Metric        | Before | After | Δ      |
| ------------- | ------ | ----- | ------ |
| Instances     | 18     | 21    | +16.7% |
| Failure rate  | 0.2%   | 8.1%  | +7.9pp |
| Incident rate | 0.0%   | 6.8%  | +6.8pp |

## Recommendation

Do not close the ticket. Consider rolling back or patching forward; the
regression is visible in both failure rate and incident rate above the
+2pp threshold.
```

**Third angle — IMPROVED on `orderFulfillment`:** the APAC shipping failure
is fixed after the first 10 seed days. Targeting that cutoff with
`elementId=Task_ShipOrder` yields a clear IMPROVED verdict on a different
element and process than the loanApproval demo.

## Context policy

- Git metadata (commit hash, deployment ID, timestamps) is **quoted
  verbatim** — it is public build metadata, not instance payload.
- **Variable contents** are not quoted.
- The `suppressed` flag is **authoritative**: a fix that looks better in the
  numbers but sits in a suppressed bucket gets **INSUFFICIENT-SIGNAL**, not
  IMPROVED. Hand-tuning thresholds is discouraged — if the dev has a tighter
  target ("from 8% down to under 1%"), the skill quotes that boundary
  verbatim in the verdict.

## When _not_ to use it

- As a general post-deploy dashboard replacement — the skill looks at one
  point (one deployment, one window). For continuous monitoring, Grafana /
  OTEL is the right tool.
- When the deployment doesn't touch a measurable path (pure refactoring,
  tests-only, docs-only) — the skill correctly returns "UNCHANGED", but you
  could have saved the time.
