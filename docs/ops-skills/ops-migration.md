# UC-O4 — `ops-migration`

> "Version 2 of `orderFulfillment` is ready. Before I open the Migration
> Wizard, I need to know: how many instances move, how many need a manual
> mapping decision, and how many are flat-out blocked — and then run it."

## Scenario

The operator is about to migrate from `v<N>` to `v<N+1>`. Cockpit's
Migration Wizard is interactive and assumes you already know which activity
ids map 1:1, which renamed, which were removed. This skill produces the
**pre-Wizard scoping answer** — a BPMN diff against the currently running
token distribution, bucketed into safe / needs-mapping / blocked — and then,
after an explicit confirmation, executes the migration as an async batch.

PLAN (Steps 1–7) is read-only. EXECUTE (Steps 8–10) writes and is gated.

## Invocation

```
/ops-migration <processDefinitionKey> <sourceVersion> <targetVersion>
```

All three arguments are required. If any are missing, the skill asks once.

## Tools involved

### PLAN phase (read-only)

| Step                   | Tool                                            | Server         |
| ---------------------- | ----------------------------------------------- | -------------- |
| Resolve both versions  | `camunda7_list_process_definitions`             | `camunda7-mcp` |
| Load both BPMN XMLs    | `camunda7_get_process_definition_xml` (×2)      | `camunda7-mcp` |
| Count active instances | `camunda7_list_process_instances`               | `camunda7-mcp` |
| Token distribution     | `camunda7_get_activity_instance_tree` (sampled) | `camunda7-mcp` |

### EXECUTE phase (gated)

| Step                        | Tool                                       | Server         | Writes? |
| --------------------------- | ------------------------------------------ | -------------- | ------- |
| Canonicalise instructions   | `camunda7_create_migration_plan`           | `camunda7-mcp` | no      |
| Migrate N instances (batch) | `camunda7_migrate_process_instances_async` | `camunda7-mcp` | **yes** |

`create_migration_plan` itself is read-only — it validates and returns the
plan the engine would execute. The actual write happens in
`migrate_process_instances_async`, which returns a `batchId`; per-instance
progress and failures land in Cockpit → Batches, not inline.

## Workflow

```
1. Resolve definition ids
   → list_process_definitions(key) → pick version == source / target
   → if either missing, stop with the available versions listed

2. Load both BPMN XMLs
   → get_process_definition_xml twice
   → parse id + name + type for Tasks, Events, Gateways, SubProcesses

3. Diff the element sets
   → Unchanged:  id in both AND same type
   → Renamed:    id only in source; target element with same type +
                 similar name (Levenshtein ≤ 5 or substring match)
   → Removed:    id only in source, no similar target
   → Added:      id only in target
   → Type-changed: id in both, type differs — always manual

4. Count running instances on source
   → list_process_instances(key, active: true, maxResults: 1000)
   → filter client-side to definitionId == sourceDefinitionId

5. Token distribution
   → for each (sampled ≤ 200) instance: get_activity_instance_tree
   → aggregate tokenCountByActivity; extrapolate if sampled
   → alternative when count > 200 and ClickHouse is on:
     query_historic_activity_instances(unfinished: true, max 10)

6. Cross-reference tokens with the diff
   → Safe 1:1      — element Unchanged
   → Needs mapping — element Renamed (best-guess target)
   → Blocked       — element Removed or Type-changed

7. Render the migration plan

8. Confirmation gate — print the plan and STOP
   → "execute-safe | execute-mapped | cockpit-only | no"
     execute-safe   → only Safe-1:1 instances migrate
     execute-mapped → Safe-1:1 + Needs-mapping (best-guess rename)
     cockpit-only   → skip execution, paste the plan into Cockpit
     no             → abort

9. Execute (gated)
   → create_migration_plan(source, target, updateEventTriggers: false)
     to canonicalise the instruction set; reconcile with the client-built list
   → migrate_process_instances_async(source, target, processInstanceIds,
                                      instructions)
   → capture batchId

10. Post-verify
    → re-run Steps 4–5 on sourceDefinitionId
    → expect Safe/Needs-mapping instances removed; Blocked unchanged

11. Hand off — if the batch shows per-instance failures in Cockpit, rerun the
    skill on the still-on-source cohort (typically stuck-at-Removed tokens
    that need ops-instance-inspect-unblock first).
```

## Example output (truncated)

````markdown
# Migration plan: `orderFulfillment` v1 → v2

## Scope

- Running instances on v1: **152**
- Source definition id: `orderFulfillment:1:a1b2…`
- Target definition id: `orderFulfillment:2:c3d4…`

## BPMN diff

| Change         | Source id          | Target id         | Notes               |
| -------------- | ------------------ | ----------------- | ------------------- |
| Unchanged      | `ValidateOrder`    | `ValidateOrder`   |                     |
| Unchanged      | `Task_ShipOrder`   | `Task_ShipOrder`  |                     |
| Renamed (0.87) | `checkInventory`   | `verifyStock`     | name match 0.87     |
| Removed        | `legacyRouteToFax` | —                 | manual intervention |
| Added          | —                  | `priorityHandoff` | new element in v2   |

## Token distribution (running on v1)

| Activity           | Tokens | Migration status              | Target mapping   |
| ------------------ | -----: | ----------------------------- | ---------------- |
| `ValidateOrder`    |     12 | Safe 1:1                      | `ValidateOrder`  |
| `Task_ShipOrder`   |    108 | Safe 1:1                      | `Task_ShipOrder` |
| `checkInventory`   |     30 | Needs mapping (rename → 0.87) | `verifyStock`    |
| `legacyRouteToFax` |      2 | Blocked — element removed     | —                |

## Summary

- **Safe**: 120 instances across 2 activities.
- **Needs mapping**: 30 instances across 1 activity (`checkInventory` → `verifyStock`).
- **Blocked**: 2 instances across 1 activity (`legacyRouteToFax`).

## Suggested Cockpit Migration Wizard input

```text
sourceProcessDefinitionId: orderFulfillment:1:a1b2…
targetProcessDefinitionId: orderFulfillment:2:c3d4…
instructions:
  - source: ValidateOrder    → target: ValidateOrder
  - source: Task_ShipOrder   → target: Task_ShipOrder
  - source: checkInventory   → target: verifyStock    # verify name match in Cockpit
# NOT AUTO-MIGRATABLE (2 instances):
#   - source: legacyRouteToFax → (element removed in v2). Decide manually.
```
````

## Caveats

- Renamed elements are a heuristic (name similarity + type match). Verify in
  Cockpit before confirming `execute-mapped`.
- Token counts are a snapshot — re-run right before execution to catch new
  starts.
- If the instance count exceeded the 200-sample cap, counts are extrapolated
  (clearly flagged).
- `execute-safe` / `execute-mapped` run as an async batch — progress and
  per-instance failures land in Cockpit → Batches, not inline.

```

## Context policy

- `processDefinitionId`, `processInstanceId`, activity ids are all cited.
- No variable values. No user-task content.
- The plan is printed, not saved — the operator owns the handoff into Cockpit.

## When _not_ to use it

- When you only need to know **what changed** structurally (no token
  distribution, no running instances) — `git diff` on the BPMN file is
  cheaper.
- When you're trying to scope a dev change on the current version —
  `dev-change-impact` is the counterpart on the developer side.
- When there are no running instances on the source version — the plan
  degenerates to "BPMN diff", and the value is minimal.
```
