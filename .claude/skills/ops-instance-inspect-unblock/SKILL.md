---
name: ops-instance-inspect-unblock
argument-hint: "<processInstanceId | businessKey>"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Deep-dive on a single Camunda 7 process instance and, if the operator wants, unblock it. Use when the user asks "inspect instance X", "instance stuck", "Instanz hängt", "unblock instance", "was macht Instanz X gerade?", or wants the Cockpit "click on one instance" flow without leaving Claude Code. INSPECT phase is read-only; UNBLOCK phase (set_job_retries, resolve_incident, correlate_message, throw_signal, modify_process_instance, set_process_instance_variable, delete_process_instance, set_task_assignee, complete_task) runs only after an explicit confirmation per action.
---

# Skill: ops-instance-inspect-unblock (UC-O3)

The single most common Cockpit operator flow: "pick one stuck instance, figure
out where it is and why, then act." The skill does the inspection (token
position, variables, incidents, jobs, tasks, recent history) and proposes an
action. The operator picks one, confirms, executes.

## IMPORTANT — context & safety policy

- Ops reports MAY cite `processInstanceId`, `businessKey`, `incidentId`, `jobId`,
  `taskId`, `activityId`.
- Variable **names** and **types** are fine. Variable **values** are only shown
  when the user explicitly asks, or for keys that look like business keys or
  correlation keys (`*Id`, `*Key`, `orderId`, `customerId`, etc.).
- INSPECT (Steps 1–8) is fully read-only.
- UNBLOCK (Steps 9–12) touches the engine. Each proposed action requires its own
  explicit confirmation. Multiple actions in one turn require multiple
  confirmations.

## Inputs

Parse `$ARGUMENTS`:

- **`processInstanceId`** — preferred.
- **`businessKey`** — acceptable if ClickHouse is available. The skill resolves
  it via `analytics_search_by_variable(variableName: "businessKey", variableValue:
<key>)` or via `camunda7_list_process_instances(businessKey: <key>)`.

If neither is provided, ask the user for one (single question).

## Instructions — INSPECT phase (read-only)

### Step 1 — Resolve the instance

If given a `processInstanceId`, skip to Step 2.

If given a `businessKey`, call `camunda7_list_process_instances(businessKey:
<key>, maxResults: 10)`:

- 1 hit → that's the instance, proceed.
- 0 hits + ClickHouse available → call
  `analytics_search_by_variable(variableName: "businessKey", variableValue: <key>)`
  for historic instances.
- Multiple hits → print the list and ask which one.

### Step 2 — Core metadata

Call `camunda7_get_process_instance(processInstanceId: <pi>)`. Capture:

- `processDefinitionKey`, `processDefinitionId`
- `businessKey`
- `suspended` flag
- `startTime` (from history, next step)

### Step 3 — Token position

Call `camunda7_get_activity_instance_tree(processInstanceId: <pi>)`.

Flatten the tree to "current activity instances" (nodes without `endTime`).
Record `activityId`, `activityType`, `incidentIds`, `entryTime`.

### Step 4 — Incidents on this instance

Call `camunda7_list_incidents(processInstanceId: <pi>)`. Capture id, type,
`activityId`, `incidentMessage`, `incidentTimestamp`, `configuration` (often a
`jobId`).

### Step 5 — Jobs

Call `camunda7_list_jobs(processInstanceId: <pi>, maxResults: 50)`. Note jobs
with `retries = 0` (failed) and jobs suspended.

### Step 6 — User tasks

Call `camunda7_list_tasks(processInstanceId: <pi>, maxResults: 50)`. For each:
`name`, `assignee`, `candidateGroup`, `created`, `due`.

### Step 7 — Recent history (context)

Call `camunda7_query_historic_activity_instances(processInstanceId: <pi>,
maxResults: 20, sortBy: startTime, sortOrder: desc)`. Gives a "last 20 steps"
trail to spot loops or long waits.

### Step 8 — Render the diagnosis block

```markdown
# Instance `<pi>` <if key: — business key `<bk>`>

## State

- Process: `<processDefinitionKey>` (id `<processDefinitionId>`)
- Started: <startTime> — running for <hours>h
- Suspended: <yes | no>
- Current activities (<N>):
  - `<activityId>` (`<activityType>`) — since <entryTime> — incidents: <ids or "none">

## Incidents (<N>)

| ID      | Type        | Activity             | Age | Message                                  |
| ------- | ----------- | -------------------- | --- | ---------------------------------------- |
| `inc-…` | `failedJob` | `callPaymentService` | 3h  | Connection refused: payment-service:8080 |

## Jobs (<N>)

| ID      | Type       | Retries | Suspended | Due              |
| ------- | ---------- | ------: | --------- | ---------------- |
| `job-…` | asyncAfter |       0 | no        | 2026-04-21T08:00 |

## Open user tasks (<N>)

| ID       | Name         | Assignee   | Due        |
| -------- | ------------ | ---------- | ---------- |
| `task-…` | Approve loan | klein@acme | 2026-04-22 |

## Variables (names only)

- `orderTotal` (Double)
- `customerSegment` (String)
- `businessKey: "ORD-12345"` <-- shown because it looks like a business key

## Recent history (last 10 steps)

- 2026-04-21T06:12 → 06:13 `validateOrder` (END)
- 2026-04-21T06:13 → — `callPaymentService` (active)
- ...
```

## Instructions — UNBLOCK phase (gated)

### Step 9 — Propose an action

Match symptoms from Steps 3–7 to one or more actions. Print the action menu:

```
> Proposed actions (pick one, or "no"):
>   A. retry-job <jobId> — set retries = 3 + resolve incident <incId>
>   B. reassign-task <taskId> to <userId>
>   C. complete-task  <taskId> with <variables>
>   D. correlate-message <messageName> [correlationKeys ...]
>   E. throw-signal  <signalName>
>   F. modify-tokens cancel <activityInstId> / startBefore <activityId>
>   G. set-variable <name> = <value>
>   H. delete-instance (cancel the process instance — irreversible)
>   S. suspend-instance — freeze the instance before an invasive change
>   X. activate-instance — thaw a previously suspended instance
```

Offer `S` whenever the operator is about to run an invasive action (F modify,
G set-variable, C complete-task with variables) and the instance is not yet
suspended — "freeze-then-modify-then-thaw" is safer than modifying a live
instance that the engine is also touching.

Only list actions whose preconditions match the diagnosis. If nothing matches,
print "No safe action matches the diagnosis — inspect manually or ask for help"
and stop.

### Step 10 — First confirmation (choose)

Operator replies with a letter (or "no" → stop). Re-print the exact tool call
you are about to make:

```
> About to call:
>   camunda7_set_job_retries(jobId: "job-abc", retries: 3)
>   camunda7_resolve_incident(incidentId: "inc-xyz")
> Confirm? yes | no
```

### Step 11 — Execute

On `yes`:

- **A** retry-job → `camunda7_set_job_retries` + `camunda7_resolve_incident`.
- **B** reassign-task → `camunda7_set_task_assignee`.
- **C** complete-task → `camunda7_complete_task(variables: {...})`.
- **D** correlate-message → `camunda7_correlate_message(messageName,
businessKey?, correlationKeys?)`.
- **E** throw-signal → `camunda7_throw_signal(name, variables?)`.
- **F** modify-tokens → `camunda7_modify_process_instance(instructions: [...])`.
- **G** set-variable → `camunda7_set_process_instance_variable(variableName,
value, type)`.
- **H** delete-instance → `camunda7_delete_process_instance`.
- **S** suspend-instance → `camunda7_suspend_process_instance`.
- **X** activate-instance → `camunda7_activate_process_instance`.

Capture outcome. On error, print and stop — do not silently continue.

### Step 12 — Re-inspect

Re-run Steps 2–7 and print a short **Before → After** diff (activities,
incidents, jobs, open tasks):

```markdown
## After

- Current activities: `<activityId>` → `<newActivityId>`
- Incidents: 1 → 0
- Jobs with retries = 0: 1 → 0
- Open user tasks: unchanged
```

### Step 13 — Hand off

Print everything to the conversation. Don't save. If multiple actions are
needed, invoke the skill again — one action per confirmation keeps the audit
trail honest.
