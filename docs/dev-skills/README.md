# Dev Skills

> 5 developer workflows that surface the runtime behavior of a Camunda 7
> process inside Claude Code — without leaving the IDE.

## Audience

Developers working on a Camunda process in the IDE who need to answer one of
the following questions:

- "What does this process actually do in production?"
- "What would my change do in the field?"
- "Which test cases reflect reality?"
- "Did my fix solve the problem?"
- "Why does this code exist — and is it still used?"

All five skills work **purely on aggregates** (path frequencies, bucket
distributions, segment lookups). No individual instance data, no raw variable
values — the skills respect `minBucketSize` (default 10) and flag suppressed
buckets instead of extrapolating them.

## Overview

| #   | Skill                                                         | Trigger                          | Core idea                                                  |
| --- | ------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| UC1 | [`dev-process-explain`](dev-process-explain.md)               | Onboarding to an unknown process | BPMN + delegate code + path frequency → behavior-first doc |
| UC2 | [`dev-change-impact`](dev-change-impact.md)                   | Before commit / deploy           | Variable distribution → project the reclassification       |
| UC4 | [`dev-test-scenarios-from-production`](dev-test-scenarios.md) | Generate test coverage           | Top paths + bucket representatives → JUnit / BPM-Assert    |
| UC5 | [`dev-fix-verification`](dev-fix-verification.md)             | After deployment                 | Pre/post comparison via `cluster.compare` → verdict        |
| UC6 | [`dev-code-archaeology`](dev-code-archaeology.md)             | Code looks dead / suspicious     | Git + 12-month path frequency → ALIVE / DEAD / UNKNOWN     |

## Reference example: `loanApproval`

All example outputs in the skill docs use the `loanApproval` process from
[`plugins/examples/cibseven-example`](../../plugins/examples/cibseven-example).
The seeder generates 200 instances per startup spread over 30 days with:

- **Paths** — the standard approval path (`StartEvent_1 → Task_0dfv74n → Gateway_approved → Task_bankTransfer → EndEvent_approved`) dominates; the reject path (`... → Task_notifyApplicant → EndEvent_rejected`) fires depending on loan amount + segment.
- **Variables** — `amount` (log-skewed, 1k–500k), `applicant`, `loanType`, `customerSegment` (PRIVATE / BUSINESS / ENTERPRISE), `currency` (EUR / USD / GBP), `channel` (ONLINE / FAX — FAX < 1%).
- **Deployment era** — the first 15 of the 30 seed days count as "pre-fix": `NotifyApplicantDelegate` throws with 15% probability and creates incidents. Afterwards the bug is fixed → `cluster.compare` shows a clear drop.

That's the foundation that lets the example outputs in the skill docs be
reproducible without hand-waving — start CIB Seven with the `seed` profile and
invoke the relevant skill.

## Shared building blocks

All skills combine the same components:

```
       BPMN + delegate code         camunda7-mcp (engine)
                │                              │
                ▼                              ▼
       ┌──────────────────┐           ┌──────────────────┐
       │ Local Workspace  │           │ Deployment meta  │
       │ Read / Grep      │           │ get_deployment   │
       └────────┬─────────┘           └────────┬─────────┘
                │                              │
                └─────────────┬────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │ analytics-mcp       │
                   │ path.frequency      │
                   │ element.bottleneck  │
                   │ variable.distribution│
                   │ cluster.compare     │
                   └──────────┬──────────┘
                              ▼
                   ┌─────────────────────┐
                   │ enrichment-mcp      │
                   │ auto_resolve        │
                   │ (segment naming)    │
                   └─────────────────────┘
```

- **`camunda7-mcp`** delivers BPMN XML and deployment metadata (used mainly by UC5).
- **`analytics-mcp`** delivers aggregated runtime metrics from ClickHouse.
- **`enrichment-mcp`** translates variable combinations into business segments
  ("Enterprise + multi-currency") via YAML-declared lookups.
- **Workspace tools** (`Read`, `Grep`, `Glob`, `Bash(git *)`) cover local code
  and history reading.

## Context policy

Hard-wired into every skill:

1. **Aggregates only.** No skill loads a single process instance record. In
   UC4 the concrete test values are always _bucket representatives_ (numeric
   midpoint, modal top-K), never real production values.
2. **`minBucketSize` is not a suggestion.** Suppressed buckets are listed in
   the report, not overwritten.
3. **Code, BPMN IDs, delegate FQNs** may be quoted verbatim. **Variable
   values** must not.
4. **Git metadata** (hash, timestamp, deployment ID) is quoted verbatim — it is
   public metadata, not instance payload.

## Running in the stack

See [Running skills in the stack](running-skills.md) — MCP server setup, skill
installation, invocation in Claude Code.
