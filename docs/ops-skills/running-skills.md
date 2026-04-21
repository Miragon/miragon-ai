# Running the Ops Skills in the Stack

> How to invoke the four ops skills from Claude Code — from prerequisites to
> the concrete prompt — and the one rule that matters most: **nothing writes
> without an explicit confirmation**.

## 1. Prerequisites

The ops skills consume two MCP servers. All four skills work against
`camunda7-mcp`; UC-O1 + UC-O3 get a nice-to-have anchor from `analytics-mcp`
when ClickHouse is on, but degrade cleanly when it isn't.

| Server          | Purpose                                                      | Required for                                           |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `camunda7-mcp`  | incidents, jobs, instances, tasks, history, BPMN XML, writes | UC-O1, UC-O2, UC-O3, UC-O4                             |
| `analytics-mcp` | `find_failed_instances`, `search_by_variable`                | UC-O1 (historical anchor), UC-O3 (business-key lookup) |

Base setup of the MCP servers: see [Quickstart](../getting-started/quickstart.md).
For the analytics anchor / variable search, ClickHouse must be active
(`CLICKHOUSE_ENABLED=true`).

## 2. Install the skills

The four skills live under `.claude/skills/<name>/SKILL.md` in the repo.
Claude Code picks them up automatically when the repo is opened as a
workspace.

```
.claude/skills/
├── ops-incident-triage/SKILL.md
├── ops-failed-job-recovery/SKILL.md
├── ops-instance-inspect-unblock/SKILL.md
└── ops-migration/SKILL.md
```

For global availability, copy the skill folders into `~/.claude/skills/`.

## 3. Connect the MCP servers in Claude Code

The same `mcp.json` that drives the dev skills works here — see
[`dev-skills/running-skills.md`](../dev-skills/running-skills.md) §3 for the
full config. The ops skills need only the `camunda7` and `analytics` entries.

The **write-enabled** `camunda7-mcp` tools — `set_job_retries`,
`set_job_retries_batch`, `resolve_incident`, `modify_process_instance`,
`delete_process_instance`, `set_process_instance_variable`,
`set_task_assignee`, `complete_task`, `correlate_message`, `throw_signal`,
`suspend_process_instance`, `activate_process_instance`,
`migrate_process_instances_async` — are exposed by default. Every ops skill
wraps them in a confirmation gate; nothing runs until you type the confirm
word.

## 4. Invoke a skill

### Pick a seed profile

The `cibseven-example` profiles shape what you'll see:

```bash
# Default: loanApproval only, 200 instances.
./gradlew :examples:cibseven-example:bootRun

# Fast iteration: both processes, ~80 instances total.
./gradlew :examples:cibseven-example:bootRun \
  -Dspring-boot.run.profiles=seed-minimal

# Full presentation mode: both processes, ~600 instances, two bug eras,
# APAC regression, dead path, rare priority-handoff.
./gradlew :examples:cibseven-example:bootRun \
  -Dspring-boot.run.profiles=seed-presentation
```

`seed-presentation` is the recommended profile for end-to-end demos — it
generates enough open incidents, failed jobs, and stuck instances to exercise
UC-O1/O2/O3 in one sitting.

### UC-O1 — Morning triage

```
/ops-incident-triage
```

Or restrict to one process / window:

```
/ops-incident-triage loanApproval 24
/ops-incident-triage orderFulfillment 168
```

The report prints, then stops at the confirmation gate. Type `retry`,
`escalate`, `both`, or `no`.

### UC-O2 — Failed-job recovery

```
/ops-failed-job-recovery
/ops-failed-job-recovery loanApproval timeout
/ops-failed-job-recovery orderFulfillment "" true      # dryRun
```

`dryRun: true` is the safe way to see the classification without the retry
invitation. With the confirmation gate, type `retry` for transient only, `all`
to include unknowns, or `no`.

### UC-O3 — Single-instance inspect / unblock

Pick any running instance id from Cockpit or from the triage sample list:

```
/ops-instance-inspect-unblock pi-0c3d7a…
```

Or via business key (requires ClickHouse for the history path):

```
/ops-instance-inspect-unblock ORD-12345
```

INSPECT runs end-to-end without prompting. The action menu follows. Each
picked action needs its own `yes | no` confirmation — multi-step unblocks
are multiple confirmations, not one.

### UC-O4 — Migration (plan + gated execution)

```
/ops-migration orderFulfillment 1 2
```

The plan prints first. Then the confirmation gate: type `execute-safe` to
migrate only the Safe-1:1 instances, `execute-mapped` to also include the
best-guess renames, `cockpit-only` to skip execution and paste the plan into
Cockpit's Migration Wizard yourself, or `no` to abort. `execute-safe` /
`execute-mapped` submit an async batch — track progress in Cockpit → Batches.

## 5. End-to-end rehearsal against `seed-presentation`

Once the example app is running with `seed-presentation`, the following six
invocations exercise the full surface in the recommended order:

```
/ops-incident-triage                                  # see the pile
/ops-incident-triage loanApproval 24                  # drill to one process
/ops-failed-job-recovery loanApproval timeout         # transient-only retry
/ops-instance-inspect-unblock <pi from the triage>    # deep-dive one case
/ops-instance-inspect-unblock <APAC-stuck pi>         # exercise modify-tokens
/ops-migration orderFulfillment 1 2                   # scope the next migration
```

## 6. Debugging

**Skill reports "Tool not available":** the relevant MCP server isn't
attached. `claude mcp tools` lists what's currently registered. All five
write-path tools the ops skills need (`set_job_retries_batch`,
`suspend_process_instance`, `activate_process_instance`,
`create_migration_plan`, `migrate_process_instances_async`) ship in
`camunda7-mcp` — if one is missing, the server is out of date.

**Confirmation gate didn't print:** the report's Summary showed zero items in
every actionable bucket. The skill stops after the report in that case; there
is nothing to confirm.

**ClickHouse off:** UC-O1 shows `Historical = unknown` and skips Step 3.
UC-O3 can't resolve business keys via history, but still works with a
`processInstanceId`.

**"No open incidents"** / "No failed jobs." / "No instance found." — that is
the skill printing a normal empty-state. Not an error.

## 7. Persisting skill output

Ops reports are **not** saved to disk by default. Two reasons: (1) they
should stay alive in the chat for the post-verify diff; (2) audit trail
belongs in the Cockpit / engine history, not a Markdown file. To file a
report in a ticket after the fact:

```
Save this as docs/ops-reports/2026-04-21-morning-triage.md
```

Or copy-paste the markdown into Jira / GitHub / the incident retrospective.
