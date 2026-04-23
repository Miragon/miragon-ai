# UC-O3 — `ops-instance-inspect-unblock`

> "Instance `pi-0c3d…` has been sitting at `callPaymentService` for 6 hours.
> What's actually going on, and what's the least invasive thing I can do to
> unblock it?"

## Scenario

The single most common Cockpit flow: click one running instance, look at its
token tree, variables, incidents, jobs, user tasks, recent history — and
decide whether to retry a job, correlate a waiting message, reassign a task,
skip an activity, or cancel the instance. The skill does the full inspection
in one pass, proposes the smallest matching action, and — per action, with a
per-action confirmation — executes it.

INSPECT is read-only. UNBLOCK writes to the engine and is gated per-action.

## Invocation

```
/ops-instance-inspect-unblock <processInstanceId | businessKey>
```

- `processInstanceId` — preferred. Direct lookup.
- `businessKey` — acceptable. Resolved via `camunda7_list_process_instances`,
  or `analytics_search_by_variable` when ClickHouse is available.

If neither is provided, the skill asks once.

## Tools involved

### INSPECT phase (read-only)

| Step                       | Tool                                         | Server          |
| -------------------------- | -------------------------------------------- | --------------- |
| Business-key resolve (opt) | `analytics_search_by_variable`               | `analytics-mcp` |
| Core metadata              | `camunda7_get_process_instance`              | `camunda7-mcp`  |
| Token position             | `camunda7_get_activity_instance_tree`        | `camunda7-mcp`  |
| Incidents                  | `camunda7_list_incidents`                    | `camunda7-mcp`  |
| Jobs                       | `camunda7_list_jobs`                         | `camunda7-mcp`  |
| Tasks                      | `camunda7_list_tasks`                        | `camunda7-mcp`  |
| Recent history             | `camunda7_query_historic_activity_instances` | `camunda7-mcp`  |

### UNBLOCK phase (gated, per action)

| Action                 | Tool                                   | Writes  |
| ---------------------- | -------------------------------------- | ------- |
| A. retry-job + resolve | `set_job_retries` + `resolve_incident` | **yes** |
| B. reassign-task       | `set_task_assignee`                    | **yes** |
| C. complete-task       | `complete_task`                        | **yes** |
| D. correlate-message   | `correlate_message`                    | **yes** |
| E. throw-signal        | `throw_signal`                         | **yes** |
| F. modify-tokens       | `modify_process_instance`              | **yes** |
| G. set-variable        | `set_process_instance_variable`        | **yes** |
| H. delete-instance     | `delete_process_instance`              | **yes** |
| S. suspend-instance    | `suspend_process_instance`             | **yes** |
| X. activate-instance   | `activate_process_instance`            | **yes** |

`S` / `X` are offered whenever the operator is about to run an invasive action
(F modify-tokens, G set-variable, C complete-task with variables) on a live
instance — "freeze-then-modify-then-thaw" is safer than modifying an instance
the engine is also touching.

## Workflow

```
INSPECT (Steps 1–8, read-only)
  1. Resolve the instance (pi directly, or businessKey → list_process_instances
     → analytics_search_by_variable fallback)
  2. get_process_instance             → processDefinitionKey, businessKey, suspended
  3. get_activity_instance_tree       → currently active activity ids, entryTimes
  4. list_incidents(pi)               → id, type, activityId, message, configuration
  5. list_jobs(pi)                    → retries, suspended, due
  6. list_tasks(pi)                   → name, assignee, candidateGroup, due
  7. query_historic_activity_instances(pi, sortBy: startTime desc, max 20)
  8. Render the diagnosis block

UNBLOCK (Steps 9–13, gated)
  9. Propose action menu (only actions whose preconditions match the diagnosis)
 10. Operator picks letter → re-print the exact tool call → "yes | no"
 11. Execute (A–H above). Capture outcome; stop on error.
 12. Re-run Steps 2–7 → print short Before → After diff
 13. Hand off (one action per confirmation keeps the audit trail honest)
```

## Example output (truncated, against `seed-presentation`)

```markdown
# Instance `pi-0c3d7a…` — business key `LEASE-12345`

## State

- Process: `assessCreditworthiness` (id `assessCreditworthiness:4:a1b2…`)
- Started: 2026-04-21T00:12 — running for 6.1h
- Suspended: no
- Current activities (1):
  - `Activity_CheckBlacklist` (`serviceTask`) — since 00:14 — incidents: `inc-9fe2`

## Incidents (1)

| ID         | Type      | Activity                  | Age | Message                                              |
| ---------- | --------- | ------------------------- | --- | ---------------------------------------------------- |
| `inc-9fe2` | failedJob | `Activity_CheckBlacklist` | 6h  | `Blacklist provider unreachable: blacklist-svc:8080` |

## Jobs (1)

| ID        | Type        | Retries | Suspended | Due              |
| --------- | ----------- | ------: | --------- | ---------------- |
| `job-a77` | asyncBefore |       0 | no        | 2026-04-21T00:14 |

## Open user tasks (0)

## Variables (names only)

- `creditScore` (Integer)
- `region` (String)
- `businessKey: "LEASE-12345"` <-- shown: looks like a business key

## Recent history (last 5 steps)

- 2026-04-21T00:12 → 00:13 `Activity_StartCreditCheck` (END)
- 2026-04-21T00:13 → 00:14 `Gateway_region` (END)
- 2026-04-21T00:14 → — `Activity_CheckBlacklist` (active)

## Proposed actions

> Proposed actions (pick one, or "no"):
> A. retry-job `job-a77` — set retries = 3 + resolve incident `inc-9fe2`
> F. modify-tokens — cancel `Activity_CheckBlacklist` activity instance

> About to call:
> camunda7_set_job_retries(jobId: "job-a77", retries: 3)
> camunda7_resolve_incident(incidentId: "inc-9fe2")
> Confirm? yes | no
```

After `A` + `yes`:

```markdown
## After

- Current activities: `Activity_CheckBlacklist` → `Activity_NextStep`
- Incidents: 1 → 0
- Jobs with retries = 0: 1 → 0
- Open user tasks: unchanged
```

## Context policy

- `processInstanceId`, `businessKey`, `incidentId`, `jobId`, `taskId`,
  `activityId` are all cited verbatim.
- Variable **names** and **types** are shown by default. **Values** only show
  for keys that look like business / correlation keys (`*Id`, `*Key`,
  `orderId`, etc.), or when the user explicitly asks.
- Each proposed action requires its own confirmation — multiple actions in one
  turn require multiple confirmations.

## When _not_ to use it

- When you have 40 failing instances with the same root cause —
  [UC-O1](ops-incident-triage.md) is the batch flow.
- When you don't care about token position and just want every transient job
  retried — [UC-O2](ops-failed-job-recovery.md) is the targeted queue clear.
- For migration-time mapping questions — [UC-O4](ops-migration.md).
