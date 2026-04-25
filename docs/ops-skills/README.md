# Ops Skills

> 4 Cockpit-operator workflows that bring the daily Camunda 7 triage,
> failed-job recovery, single-instance deep-dive, and migration-planning flows
> into Claude Code.

## Audience

Operators who today work in the Camunda 7 Cockpit — Incidents tab, Failed Jobs,
Running Process Instances, Migration Wizard — and want the same handgriffs
from Claude Code, with grouping and classification intelligence that the bare
Cockpit does not provide.

Scope is the **Cockpit-operator MVP**. Broader analyst / SRE scenarios from
[`concepts/operations-skills.md`](../concepts/operations-skills.md)
(performance, capacity planning, RCA with OTEL, comparison, SLA-watch, audit
trail) are intentionally out of scope for the MVP; they are analyst territory
rather than Cockpit territory.

## Overview

| #     | Skill                                                             | Trigger                                | Core idea                                                             | Writes? |
| ----- | ----------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- | ------- |
| UC-O1 | [`ops-incident-triage`](ops-incident-triage.md)                   | Morning triage, "what broke overnight" | Group open incidents → classify → gated retry/resolve                 | gated   |
| UC-O2 | [`ops-failed-job-recovery`](ops-failed-job-recovery.md)           | "retry failed jobs"                    | Classify transient vs. permanent → gated batch retry                  | gated   |
| UC-O3 | [`ops-instance-inspect-unblock`](ops-instance-inspect-unblock.md) | "instance stuck", "Instanz hängt"      | Deep-dive one instance → propose action → execute w/ confirm          | gated   |
| UC-O4 | [`ops-migration`](ops-migration.md)                               | "migrate v1 to v2"                     | BPMN diff + token distribution → activity mapping → gated async batch | gated   |

## Shape

Every skill mirrors the dev-skill pattern:

- Numbered, explicit steps. Each step names the exact MCP tool + params.
- A markdown block the skill must render.
- A **confirmation gate** before any write — the skill prints the plan and
  stops until the operator explicitly confirms.
- A **post-verify** step after execution: re-query and diff.

## Context & safety policy (hard-wired in every skill)

1. **Individual ids are allowed** in ops reports (`processInstanceId`,
   `incidentId`, `jobId`, `taskId`, `activityId`). The operator legitimately
   needs them to act.
2. **Variable values are not quoted** unless the variable is a business key /
   correlation key, or the user explicitly asks.
3. **Write actions are gated.** `resolve_incident`, `set_job_retries`,
   `modify_process_instance`, `delete_process_instance`,
   `set_process_instance_variable`, `set_task_assignee`, `complete_task`,
   `correlate_message`, `throw_signal` run only after an explicit
   confirmation in the same turn. Multiple actions per turn require multiple
   confirmations.
4. **Per-item failures don't abort** the loop. They land in the post-verify
   diff.
5. **ClickHouse-optional.** Skills that use `analytics_find_failed_instances`
   or `analytics_search_by_variable` skip those steps cleanly when ClickHouse
   isn't enabled.

## Shared building blocks

```
              camunda7-mcp (engine, 37 tools)        analytics-mcp (ClickHouse-backed)
              ──────────────────────────────        ─────────────────────────────────
                          │                                       │
                          ▼                                       ▼
                 ┌──────────────────┐                   ┌──────────────────────┐
                 │ list_*, get_*    │                   │ find_failed_instances │
                 │ resolve_incident │                   │ search_by_variable    │
                 │ set_job_retries  │                   │ search_process_inst.  │
                 │ modify_*         │                   │ compare_execution_*   │
                 │ correlate/throw  │                   └──────────────────────┘
                 └──────────────────┘
```

## MCP tool coverage

The five tools the MVP needs are all in the camunda7-mcp server:

| Tool                                       | Used by | Purpose                                                        |
| ------------------------------------------ | ------- | -------------------------------------------------------------- |
| `camunda7_set_job_retries_batch`           | UC-O2   | Single batch call instead of N per-job calls; yields batchId   |
| `camunda7_suspend_process_instance`        | UC-O3   | Freeze an instance before invasive changes                     |
| `camunda7_activate_process_instance`       | UC-O3   | Inverse of suspend                                             |
| `camunda7_create_migration_plan`           | UC-O4   | Generate a migration plan (mirrors Cockpit's Migration Wizard) |
| `camunda7_migrate_process_instances_async` | UC-O4   | Execute the plan over N instances as an async batch            |

## Reference fixtures

The skills work against the same `cibseven-example` seeds the dev-skills use.
For live demos, the `seed-presentation` profile produces enough incidents,
failed jobs, and stuck instances to exercise UC-O1/O2/O3 end-to-end. See
[`running-skills.md`](running-skills.md) for the exact commands.

## Where this sits

- [`concepts/operations-skills.md`](../concepts/operations-skills.md) — the
  full 9-scenario concept. The MVP here picks the 4 that map 1:1 to daily
  Cockpit work.
- [`dev-skills/README.md`](../dev-skills/README.md) — the developer-audience
  counterpart. Shape and conventions are shared.
