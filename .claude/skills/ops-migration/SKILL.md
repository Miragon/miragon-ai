---
name: ops-migration
argument-hint: "<processDefinitionKey> <sourceVersion> <targetVersion>"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Plan and (optionally) execute a Camunda 7 process migration from version N to N+1. Use when the user asks "migrate v1 to v2", "Prozessversion migrieren", "migration plan", "welche Aktivitäten sind umbenannt?", or wants to scope a mass migration before running Cockpit's migration wizard. Produces an activity-mapping plan grounded in the real token distribution of currently running instances, then offers a gated async batch execution via `camunda7_create_migration_plan` + `camunda7_migrate_process_instances_async`.
---

# Skill: ops-migration (UC-O4)

Produce a **migration plan** grounded in the real token distribution of
currently running instances, then — with an explicit confirmation — execute
it as an async batch. The plan's value is upfront scoping: how many instances
move, which activity IDs map 1:1, which need a manual decision, which are
structurally blocked.

## IMPORTANT — context & safety policy

- Ops reports MAY cite `processDefinitionId`, `processInstanceId`, activity ids.
- PLAN phase (Steps 1–7) is fully read-only.
- EXECUTE phase (Steps 8–10) writes. Requires an explicit confirmation.
- The plan is based on **currently active** instances; if new instances start
  between plan and execution, re-run the skill for a fresh count.

## Inputs

Parse `$ARGUMENTS`:

- **`processDefinitionKey`** — required.
- **`sourceVersion`** — required. The version to migrate **from** (integer).
- **`targetVersion`** — required. The version to migrate **to** (integer).

If any are missing, ask the operator for the three values (one question).

## Instructions

### Step 1 — Resolve both definition ids

Call `camunda7_list_process_definitions(key: <key>, maxResults: 100)`. From the
result, pick:

- `sourceDefinitionId` — entry with `version == sourceVersion`.
- `targetDefinitionId` — entry with `version == targetVersion`.

If either is missing, stop with a clear error listing the available versions.

### Step 2 — Load both BPMN XMLs

Call `camunda7_get_process_definition_xml(processDefinitionId: <id>)` twice —
once per version.

Parse each XML (regex on `<bpmn:*Task id="..." name="...">` and `<bpmn:*Event`,
`<bpmn:*Gateway`, `<bpmn:subProcess`). Build two sets:

- `sourceElements: Map<activityId, {type, name}>`
- `targetElements: Map<activityId, {type, name}>`

### Step 3 — Diff the element sets

- **Unchanged**: `activityId` in both sets AND `type` matches.
- **Renamed** (heuristic): id present in source but not in target, AND a target
  element with same `type` + similar `name` (Levenshtein distance ≤ 5 or one is
  a substring of the other). Flag low confidence.
- **Removed**: id only in source, no similar target element.
- **Added**: id only in target.
- **Type-changed**: id in both but `type` differs — always manual.

### Step 4 — Count running instances on source

Call `camunda7_list_process_instances(processDefinitionKey: <key>, active:
true, maxResults: 1000)`. Filter client-side to those with `definitionId ==
sourceDefinitionId`. If more than 1000, note "instance count > 1000, sampling
only" and continue.

### Step 5 — Token distribution

For each instance from Step 4, call
`camunda7_get_activity_instance_tree(processInstanceId: <pi>)` and flatten to
currently-active `activityId`s. Aggregate:

- `tokenCountByActivity: Map<activityId, count>` — summed across instances.

For performance, **sample up to 200 instances**. If the total is larger, pick a
uniform-random sample and extrapolate counts (clearly flagged as estimated).

Alternative when instances > 200 and ClickHouse is available: call
`camunda7_query_historic_activity_instances(processInstanceId: <each>,
unfinished: true, maxResults: 10)` — cheaper than the full tree.

### Step 6 — Cross-reference tokens with the diff

For each `activityId` in `tokenCountByActivity`:

- **Safe 1:1** — element is Unchanged in Step 3. Migrates automatically.
- **Needs mapping** — element is Renamed (with a best-guess target).
- **Blocked** — element is Removed or Type-changed. Needs manual intervention;
  cannot be migrated without a Cockpit-wizard decision.

### Step 7 — Render the migration plan

````markdown
# Migration plan: `<key>` v<source> → v<target>

## Scope

- Running instances on v<source>: **N** <if sampled: "(sampled 200 of N)">
- Source definition id: `<sourceDefinitionId>`
- Target definition id: `<targetDefinitionId>`

## BPMN diff

| Change         | Source id          | Target id         | Notes                    |
| -------------- | ------------------ | ----------------- | ------------------------ |
| Unchanged      | `validateOrder`    | `validateOrder`   |                          |
| Renamed (0.87) | `checkInventory`   | `verifyStock`     | name match 0.87          |
| Removed        | `legacyRouteToFax` | —                 | manual intervention      |
| Added          | —                  | `priorityHandoff` | new element in v<target> |

## Token distribution (running on v<source>)

| Activity           | Tokens | Migration status              | Target mapping   |
| ------------------ | -----: | ----------------------------- | ---------------- |
| `validateOrder`    |    120 | Safe 1:1                      | `validateOrder`  |
| `waitForPayment`   |     50 | Safe 1:1                      | `waitForPayment` |
| `checkInventory`   |     30 | Needs mapping (rename → 0.87) | `verifyStock`    |
| `legacyRouteToFax` |      2 | Blocked — element removed     | —                |

## Summary

- **Safe**: 170 instances across 2 activities.
- **Needs mapping**: 30 instances across 1 activity (`checkInventory` → `verifyStock`).
- **Blocked**: 2 instances across 1 activity (`legacyRouteToFax`).

## Suggested Cockpit Migration Wizard input

```text
sourceProcessDefinitionId: <sourceDefinitionId>
targetProcessDefinitionId: <targetDefinitionId>
instructions:
  - source: validateOrder    → target: validateOrder
  - source: waitForPayment   → target: waitForPayment
  - source: checkInventory   → target: verifyStock   # verify name match in Cockpit
# NOT AUTO-MIGRATABLE (2 instances):
#   - source: legacyRouteToFax → (element removed in v<target>). Decide manually.
```
````

## Caveats

- Renamed elements are a heuristic (name similarity + type match). Verify in
  Cockpit before confirming `execute-mapped`.
- Token counts were gathered at <timestamp>. Re-run the skill right before
  execution to catch new starts.
- If instance count exceeded the sample cap (200), counts are extrapolated.
- `execute-safe` / `execute-mapped` run as an **async batch** — progress and
  per-instance failures land in Cockpit → Batches, not inline.

```

### Step 8 — Confirmation gate

Print the plan, then this block and STOP:

```

> Confirm? Type one of:
> execute-safe — migrate only the Safe-1:1 instances. Needs-mapping and
> Blocked instances stay on v<source>.
> execute-mapped — migrate Safe-1:1 AND Needs-mapping instances with the
> best-guess activity mapping above.
> cockpit-only — skip execution, I'll paste the plan into Cockpit.
> no — abort.

```

Do not call any write tool before the operator answers.

### Step 9 — Execute (gated)

- **cockpit-only / no** → print "No action taken" and stop.
- **execute-safe** → build `instructions` from the Safe-1:1 rows only; select
  `processInstanceIds` = instances whose active activities are all Safe-1:1.
- **execute-mapped** → build `instructions` from Safe-1:1 + Needs-mapping
  rows; select `processInstanceIds` = instances whose active activities are
  all in {Safe-1:1 ∪ Needs-mapping}. Blocked instances are excluded.

Then call — once — :

```

camunda7_create_migration_plan(
sourceProcessDefinitionId,
targetProcessDefinitionId,
updateEventTriggers: false
)

```

to validate / canonicalise the instruction set. Cross-check the returned plan
against the `instructions` you built; reconcile any conflict before executing
(engine-generated instructions win on id overlap).

Then:

```

camunda7_migrate_process_instances_async(
sourceProcessDefinitionId,
targetProcessDefinitionId,
processInstanceIds: [...],
instructions: [...final list...]
)

````

Capture the returned `batchId`.

### Step 10 — Post-verify

Re-run Steps 4–5 with identical filters (on `sourceDefinitionId`). Expected:

- Safe-1:1 / Needs-mapping instances are no longer in the count (they moved to
  target).
- Blocked instances are unchanged.

Print:

```markdown
## After

- Migration batch: `<batchId>` (poll progress via Cockpit Batches tab)
- Instances selected for migration: **N**
- Instances still on v<source>: **M** (expected to match the `Blocked` count)
- Instructions submitted: <count>
````

### Step 11 — Hand off

Print the plan, confirmation, and post-verify. Don't save. If the batch shows
per-instance failures in Cockpit, rerun the skill on the still-on-source
cohort — the failures are typically stuck-at-Removed tokens that need
`ops-instance-inspect-unblock` first.
