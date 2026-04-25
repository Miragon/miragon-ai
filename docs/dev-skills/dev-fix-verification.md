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

## Example output (against the `assessCreditworthiness` seed)

The seeder marks the first of two 15-day blocks as the "pre-fix" era in
which `CheckBlacklistDelegate` throws a `RuntimeException` ("Blacklist
provider unreachable") with 15% probability and produces job-level incidents.
The cutoff in the middle of the window is the simulated deployment timestamp.

```markdown
# Fix verification: deployment `assessCreditworthiness-seed-deploy`

## Verdict

**IMPROVED**

Incident rate dropped from 12.8% to 0.0% on element `Activity_CheckBlacklist` of
`assessCreditworthiness`.

## Deployment

- ID: `assessCreditworthiness-seed-deploy` (seed cutoff between buggy era and post-fix)
- Timestamp: `2026-04-07 00:00:00 UTC` (T0 - 15 days)
- Name / source: `miravelo-creditworthiness.bpmn` with the fixed delegate
- Window: ±7 days

## KPIs

| Metric        | Before | After | Δ       |
| ------------- | ------ | ----- | ------- |
| Instances     | 48     | 54    | +12.5%  |
| Failure rate  | 13.1%  | 0.0%  | -13.1pp |
| Incident rate | 12.8%  | 0.0%  | -12.8pp |
| Avg duration  | 52ms   | 38ms  | -27%    |
| P95 duration  | 280ms  | 110ms | -61%    |

## Caveats

- Suppressed: false (both windows above minBucketSize=10 instances).
- Window age: post-window complete (7 of 7 seed days).
- Scope: process=`assessCreditworthiness`, element=`Activity_CheckBlacklist`.

## Recommendation

Close the ticket. The fix eliminated the job-level incidents on the blacklist
check and more than halved the p95 duration — no signs of regressions in
other metrics.
```

## Second presentation example: REGRESSED verdict (`seed-presentation`)

The `seed-presentation` profile deliberately stages a **second** bug era on
the parent `miraveloLeasing` process — a narrow band at days 7–10 ago (the
"rollback era") where `SendPolicyDelegate` throws at ~12% while rendering
the policy template, bracketed by healthy rates before and after. Pointing
UC5 at a deployment whose timestamp centers on that band produces a REGRESSED
verdict on a different element + delegate than the blacklist demo.

```
/dev-fix-verification <rollback-era-deployment-id> miraveloLeasing Activity_SendPolicy 3
```

Pick the deployment whose timestamp sits around `now() - 8.5d` — the
deployment list from `camunda7_list_deployments` shows one on either side of
the rollback band; in the presentation seed the two relevant anchors are
labeled internally as `miraveloLeasing-rollback-intro` and
`miraveloLeasing-rollback-revert`.

Expected output shape (truncated):

```markdown
# Fix verification: deployment `miraveloLeasing-rollback-intro`

## Verdict

**REGRESSED**

Incident rate on `Activity_SendPolicy` rose from 0.3% to 11.4% in the 3-day
window immediately after the rollout — matching the simulated regression band.

## KPIs

| Metric        | Before | After | Δ       |
| ------------- | ------ | ----- | ------- |
| Instances     | 19     | 22    | +15.8%  |
| Failure rate  | 0.3%   | 11.4% | +11.1pp |
| Incident rate | 0.0%   | 9.1%  | +9.1pp  |

## Recommendation

Do not close the ticket. Consider rolling back or patching forward; the
regression is visible in both failure rate and incident rate above the
+2pp threshold.
```

**Third angle — IMPROVED on the sub-process:** the blacklist outage is fixed
after the first 15 seed days. Targeting that cutoff with
`elementId=Activity_CheckBlacklist` of `assessCreditworthiness` yields a clear
IMPROVED verdict on a different element and process than the SendPolicy
rollback demo.

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
