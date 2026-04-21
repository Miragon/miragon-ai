# UC-O1 — `ops-incident-triage`

> "47 incidents open since I logged off. Which ones are transient, which ones
> need a dev, and can I batch-clear them before standup?"

## Scenario

A Camunda 7 operator opens Cockpit in the morning and is staring at a list of
open incidents across every running process. The Cockpit Incidents tab lets
her sort and filter, but it doesn't group by message, doesn't tell her which
look like flaky downstreams vs. real bugs, and doesn't offer a one-click
"retry the transient cohort, resolve the permanent cohort". The skill does
that: groups, classifies, proposes, and — after one explicit confirmation —
executes.

## Invocation

```
/ops-incident-triage [processDefinitionKey] [windowHours]
```

- `processDefinitionKey` — optional. Restrict triage to one definition.
- `windowHours` — optional, default `24`, clamped `1..168`.

With no arguments: triage every open incident in the last 24h. The skill does
**not** ask clarifying questions for a morning-triage use case — the operator
wants the report first, and can re-invoke with a narrower scope.

## Tools involved

| Step                           | Tool                                | Server          | Writes? |
| ------------------------------ | ----------------------------------- | --------------- | ------- |
| Pull open incidents            | `camunda7_list_incidents`           | `camunda7-mcp`  | no      |
| Resolve key → definition id    | `camunda7_list_process_definitions` | `camunda7-mcp`  | no      |
| Historical pattern anchor      | `analytics_find_failed_instances`   | `analytics-mcp` | no      |
| Find failing jobs per incident | `camunda7_list_jobs`                | `camunda7-mcp`  | no      |
| Bump retries                   | `camunda7_set_job_retries`          | `camunda7-mcp`  | **yes** |
| Resolve incident               | `camunda7_resolve_incident`         | `camunda7-mcp`  | **yes** |

## Workflow

```
1. Pull open incidents in window
   → camunda7_list_incidents (filtered by processDefinitionId if given)
   → client-side filter to incidentTimestamp >= now - windowHours

2. Group by (incidentMessage, activityId)
   → aggregate count, firstSeen, lastSeen, sampleInstanceIds, incidentIds
   → sort by count desc

3. Enrich with historical pattern (ClickHouse-optional)
   → analytics_find_failed_instances (groupByError: true, period: 1d or 7d)
   → merge on (message, activityId) → historicalCount per group

4. Classify each group
   → transient:  timeout, connect, refused, 5xx, SocketTimeout, IOException
   → permanent:  Validation, NPE, ClassCast, 4xx, constraint
   → manual:     anything else (or matches both — err on the side of manual)

5. Render the triage report
   → Summary + Groups table + proposed action plan + caveats

6. Confirmation gate — print and STOP
   → "retry | escalate | both | no"

7. Execute (only on explicit confirm)
   → retry:    list_jobs(pi, noRetriesLeft: true) → set_job_retries(3) → resolve_incident
   → escalate: resolve_incident only
   → capture per-item outcome, never abort the loop on a single failure

8. Post-verify
   → re-run Step 1 with identical filters
   → diff: "open before N → open after M, retries=S, resolves=R, failures=[...]"
```

## Example output (truncated, against `seed-presentation`)

```markdown
# Incident triage — last 24h for `loanApproval`

## Summary

- Total open incidents: **58**
- Distinct error groups: **3**
- Retry candidates: 47 incidents across 1 group
- Escalation candidates: 8 incidents across 1 group
- Manual review: 3 incidents across 1 group

## Groups

| #   | Count | Historical (1d) | Activity               | Classification       | Message                                             |
| --- | ----: | --------------: | ---------------------- | -------------------- | --------------------------------------------------- |
| 1   |    47 |              12 | `Task_notifyApplicant` | Retry (transient)    | `Connection refused: notification-service:8080`     |
| 2   |     8 |               0 | `Task_validateAmount`  | Escalate (permanent) | `NullPointerException at ...ValidateAmountDelegate` |
| 3   |     3 |               3 | `Task_bankTransfer`    | Manual review        | `HTTP 429 Too Many Requests`                        |

## Proposed action plan

**Retry (bump retries to 3, then resolve the incident):**

- Group 1 — 47 incidents. Sample: `pi-abc`, `pi-def`, … (10 shown).

**Escalate (resolve without retry — hand to dev team):**

- Group 2 — 8 incidents. Sample: `pi-ghi`, …

**Manual review (no action proposed):**

- Group 3 — 3 incidents. Sample: `pi-jkl`, …

> Confirm? Type one of:
> retry — execute retries for the Retry groups only
> escalate — resolve (without retry) the Escalate groups only
> both — retry + escalate
> no — abort
```

After a `both` confirmation:

```markdown
## After

- Open incidents before: **58**
- Open incidents after: **3**
- Actions executed: 47 retries, 55 resolves
- Per-item failures: none
```

## Context policy

- Incident, job, and instance ids are cited verbatim — the operator needs them
  to act.
- Variable values are **not** quoted. Variable names show only when an
  incident message references one.
- ClickHouse-optional: if `CLICKHOUSE_ENABLED=false`, Step 3 is skipped and
  the Groups table shows `Historical = unknown`.

## When _not_ to use it

- When you already know the problem is a single stuck instance —
  [UC-O3](ops-instance-inspect-unblock.md) is the targeted flow.
- When the failure is a pure failed-job cohort with no incidents yet (e.g.
  after a `noRetriesLeft` batch without corresponding incidents) —
  [UC-O2](ops-failed-job-recovery.md) works on jobs directly.
- When you want root-cause analysis over a trend, not a queue clear — that is
  analyst territory, not MVP.
