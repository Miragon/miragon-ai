---
name: ops-incident-triage
argument-hint: "[processDefinitionKey] [windowHours]"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Morning triage for a Camunda 7 operator. Use when the user asks "triage incidents", "what broke overnight", "Inzidenzen gruppieren", "Morgenrunde", or wants to turn a pile of open incidents into a small set of root-cause groups with a suggested retry / resolve plan. Groups open incidents by error message + activity, classifies each group transient vs. permanent, and executes retries / resolves only after an explicit user confirmation.
---

# Skill: ops-incident-triage (UC-O1)

Turn N open incidents into a small, classified action plan — the same move an
operator makes in Cockpit's Incidents tab, but with the grouping and
transient/permanent classification already done.

The point of this skill is **batch decision support with a confirmation gate**.
Read-only steps produce a report; write steps (`set_job_retries`,
`resolve_incident`) run only after the operator types "yes, execute".

## IMPORTANT — context & safety policy

- Ops reports MAY cite individual `incidentId`, `processInstanceId`, `jobId` — the
  operator legitimately needs them to act. Variable values MUST NOT be quoted
  unless the variable is a business key or correlation key.
- Every write action requires an explicit user confirmation in the same turn (see
  Step 6 — Confirmation gate). If the user does not explicitly confirm, the skill
  prints the plan and stops.
- Per-item failures during execution are captured and listed in the post-verify
  step; they do not abort the run.
- If ClickHouse is not configured (`CLICKHOUSE_ENABLED=false`), skip Step 3 and
  note it in the report.

## Inputs

Parse `$ARGUMENTS`:

- **`processDefinitionKey`** — optional. Restrict triage to one definition. If
  omitted, triage every open incident.
- **`windowHours`** — optional. Clamp to `1..168`. Default `24`.

If both are absent, proceed with the defaults. Do not ask clarifying questions
for a morning-triage use case — the operator wants the report first, ask later.

## Instructions

### Step 1 — Pull open incidents

Call `camunda7_list_incidents`:

```
processDefinitionId: <optional, if the user gave processDefinitionKey, resolve it
                     via camunda7_list_process_definitions → id first>
maxResults: 500
sortBy: incidentTimestamp
sortOrder: desc
```

Filter client-side to the `windowHours` window (`incidentTimestamp >= now -
windowHours`).

If the result is empty, print "No open incidents in the last {window}h" and stop.

### Step 2 — Group by `(incidentMessage, activityId)`

Aggregate in-skill. For each group, capture:

- `message` — the incident message (first ~200 chars, truncated).
- `activityId` — the BPMN activity that raised it.
- `processDefinitionKey`.
- `count` — number of incidents in the group.
- `firstSeen`, `lastSeen` — min/max `incidentTimestamp`.
- `sampleInstanceIds` — up to 10 `processInstanceId`s.
- `incidentIds` — all ids (for later execution).

Sort groups by `count` descending.

### Step 3 — Enrich with ClickHouse pattern signal (optional)

If ClickHouse is available, call `analytics_find_failed_instances`:

```
processDefinitionKey: <if provided>
period: 1d            # or 7d if windowHours > 24
groupByError: true
limit: 20
```

Cross-reference with Step 2 groups on `(incidentMessage, activityId)`. This gives
a 24h/7d historical anchor: "has this group fired before, or is it new?". Record
`historicalCount` per group (0 = new pattern).

If ClickHouse is unavailable, skip and note `historicalCount = unknown` in the
report.

### Step 4 — Classify each group

Apply the rule set:

- **Retry-Kandidat (transient)** — message matches any of:
  `timeout`, `connect`, `refused`, `unreachable`, `503`, `502`, `504`,
  `SocketTimeout`, `ConnectException`, `IOException`.
- **Eskalations-Kandidat (permanent)** — message matches any of:
  `ValidationException`, `NullPointerException`, `ClassCastException`,
  `IllegalArgumentException`, `NumberFormatException`, `400 Bad Request`,
  `404 Not Found`, `SQL`, `constraint`.
- **Manuell prüfen** — anything else.

Case-insensitive. If a message matches both buckets, prefer **manuell prüfen** —
err on the side of not retrying.

### Step 5 — Render the triage report

```markdown
# Incident triage — last <windowHours>h <if key: for `<key>`>

## Summary

- Total open incidents: **N**
- Distinct error groups: **G**
- Retry candidates: **R** incidents across **Rg** groups
- Escalation candidates: **E** incidents across **Eg** groups
- Manual review: **M** incidents across **Mg** groups

## Groups

| #   | Count | Historical (1d) | Activity        | Classification       | Message                                    |
| --- | ----: | --------------: | --------------- | -------------------- | ------------------------------------------ |
| 1   |    47 |              12 | `validateOrder` | Retry (transient)    | `Connection refused: payment-service:8080` |
| 2   |     8 |               0 | `checkStock`    | Escalate (permanent) | `NullPointerException at ...`              |
| 3   |     3 |               3 | `shipOrder`     | Manual review        | `HTTP 429 Too Many Requests`               |

## Proposed action plan

**Retry (bump retries to 3, then resolve the incident):**

- Group 1 — 47 incidents. Sample instances: `pi-abc`, `pi-def`, … (10 shown).

**Escalate (resolve the incident, do NOT retry — hand to dev team):**

- Group 2 — 8 incidents. Sample instances: `pi-ghi`, …

**Manual review (no action proposed):**

- Group 3 — 3 incidents. Sample instances: `pi-jkl`, …

## Caveats

- Window: <windowHours>h. Older incidents are not considered.
- ClickHouse historical anchor: <enabled | disabled>.
- Classification is heuristic — review the Retry list before confirming.
```

### Step 6 — Confirmation gate

Print this literal block and stop:

```
> Confirm? Type one of:
>   retry      — execute retries for the Retry groups only
>   escalate   — resolve (without retry) the Escalate groups only
>   both       — retry + escalate
>   no         — abort, take no action
```

Do **not** call any write tool before the operator answers.

### Step 7 — Execute

Based on the answer:

- **retry** or **both**: for each incident in the Retry groups,
  1. Call `camunda7_list_jobs(processInstanceId: <pi>, noRetriesLeft: true)` to
     find the failing job(s).
  2. For each returned `jobId`: `camunda7_set_job_retries(jobId, retries: 3)`.
  3. Then `camunda7_resolve_incident(incidentId)` for the incident.

- **escalate** or **both**: for each incident in the Escalate groups,
  `camunda7_resolve_incident(incidentId)` only. Do not touch the jobs.

Capture per-item outcome (`ok | error: <message>`). Never abort the loop on a
single failure.

### Step 8 — Post-verify

Re-run Step 1 (same filters). Print a short diff block:

```markdown
## After

- Open incidents before: **N**
- Open incidents after: **M**
- Actions executed: <retries> retries, <resolves> resolves
- Per-item failures: <list if any, else "none">
```

### Step 9 — Hand off

Print the report + post-verify. Do not save to file unless the operator asks.
The operator owns the follow-up (escalation tickets, notifying the dev team).
