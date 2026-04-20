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

## Reference examples: `loanApproval` + `orderFulfillment`

All example outputs in the skill docs use two processes from
[`plugins/examples/cibseven-example`](../../plugins/examples/cibseven-example).

The seeder runs in three flavors, selected via the Spring profile
(`-Dspring-boot.run.profiles=seed | seed-minimal | seed-presentation`):

| Profile             | loanApproval | orderFulfillment | Instances | Purpose                                                   |
| ------------------- | ------------ | ---------------- | --------- | --------------------------------------------------------- |
| `seed` (default)    | 200          | 0                | 200       | Backward-compatible; matches the legacy examples          |
| `seed-minimal`      | 40           | 40               | ~80       | Fast local iteration, CI smoke tests                      |
| `seed-presentation` | 300          | 300              | ~600      | Full presentation coverage — every UC has 2+ demo moments |

### `loanApproval`

- **Paths** — the standard approval path (`StartEvent_1 → Task_0dfv74n → Gateway_approved → Task_bankTransfer → EndEvent_approved`) dominates; the reject path (`... → Task_notifyApplicant → EndEvent_rejected`) fires depending on loan amount + segment.
- **Variables** — `amount` (log-skewed, 1k–500k), `applicant`, `loanType`, `customerSegment` (PRIVATE / BUSINESS / ENTERPRISE), `currency` (EUR / USD / GBP), `channel` (ONLINE / FAX — FAX < 1%). In `seed-presentation` also `region` (EU / US / APAC) and `priorityFlag` (boolean).
- **Deployment eras** — `seed` has one buggy era (first 15 days). `seed-presentation` adds a second, narrow **rollback era** at days 7–10 so UC5 can demo both IMPROVED and REGRESSED verdicts.
- **Dead combination** — in `seed-presentation`, student loans are hard-capped at €40k → `loanType == "student" && amount > 100_000` is structurally unreachable → UC6 DEAD verdict.

### `orderFulfillment` (seeded in `seed-minimal` / `seed-presentation` only)

- **Paths** — 3-way region gateway (EU-Review → Ship; US-Review → Ship; APAC-Express → Ship), optional Priority-Handoff after ship, Timer-Escalation on stuck APAC tasks.
- **Variables** — `orderId`, `customerId`, `region` (EU 55% / US 30% / APAC 15%), `priorityFlag` (true ~3% — ALIVE-rare), `amount`, `itemCount`, `shippingMethod` (STANDARD / EXPRESS / FREIGHT).
- **Deployment era** — APAC shipping bug in days 1–10 (`shipOrderDelegate` throws at 20% for APAC) → second UC5 IMPROVED demo, distinct element + process from loanApproval.
- **Timer escalation** — fires for ~1% of APAC orders → below minBucketSize → UC6 UNKNOWN on a different element than FAX.

Start CIB Seven with one of the seed profiles and invoke the relevant skill.

### Presentation walkthrough

For a live demo against `seed-presentation`, follow
[`presentation-script.md`](presentation-script.md) — step-by-step
invocations, expected output snippets, talking points, and fallbacks.

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
