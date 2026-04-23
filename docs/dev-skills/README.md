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

## Reference example: `miraveloLeasing`

All example outputs in the skill docs use Miravelo's bike-leasing showcase
from [`plugins/examples/cibseven-example`](../../plugins/examples/cibseven-example).
It is a two-deployment process: `miraveloLeasing` (parent) calls
`assessCreditworthiness` (sub-process) via a BPMN call activity.

The seeder runs in three flavors, selected via the Spring profile
(`-Dspring-boot.run.profiles=seed | seed-minimal | seed-presentation`):

| Profile             | Instances | Cargo cap | Rollback era | Purpose                                                   |
| ------------------- | --------- | --------- | ------------ | --------------------------------------------------------- |
| `seed` (default)    | 200       | off       | off          | Legacy-shape default; single bug era for UC5 IMPROVED     |
| `seed-minimal`      | ~80       | on        | off          | Fast local iteration, CI smoke tests                      |
| `seed-presentation` | ~600      | on        | on           | Full presentation coverage — every UC has 2+ demo moments |

### What the seeder produces

- **Paths** — the dominant path is "creditworthy customer → leasing policy
  issued" (`StartEvent_LeasingInquiry → Activity_ResolveCustomer → Activity_AssessCreditworthiness → Gateway_Creditworthy → Activity_SendPolicy → Activity_DeliverPolicy → Event_PolicyIssued`).
  A smaller branch ("Risk identified") routes through the "Decide on application"
  user task (`Activity_DecideOnApplication`) and then either issues the policy or rejects
  it at `Event_PolicyRejected`.
- **Variables** — every instance carries `customerId`, `creditScore` (300–850),
  `postalCode`, `region` (EU / US / APAC), `bikeModel` (city / cargo / trail /
  road), `leaseAmount` (€800–25k, log-skewed), `leaseTermMonths` (12 / 24 /
  36 / 48), `customerSegment` (PRIVATE / BUSINESS / STUDENT), `channel`
  (ONLINE / BRANCH / FAX), `priorityFlag` (boolean).
- **Deployment eras** — `seed` has one buggy era (first 15 seed days): the
  upstream blacklist provider is unreachable and `CheckBlacklistDelegate`
  throws on ~15 % of instances → incidents on `Activity_CheckBlacklist` in the
  sub-process. `seed-presentation` adds a narrow **rollback era** at days
  7–10 where the policy template mis-renders on `Activity_SendPolicy` at ~12 %
  → UC5 demos both IMPROVED and REGRESSED verdicts on different elements.
- **Dead combination** — in `seed-presentation` (and `seed-minimal`) cargo
  bikes are hard-capped at 24 months → `bikeModel == "cargo" && leaseTermMonths
  > 24` is structurally unreachable → UC6 DEAD verdict.
- **Suppressed buckets** — `channel == "FAX"` at ~1 % stays below
  `minBucketSize=10` → UC6 UNKNOWN. The 2 h non-interrupting boundary timer
  on `Activity_DecideOnApplication` fires for a small fraction of risk-identified
  instances → `Event_DecisionAccelerated` is a second suppressed bucket on a different
  element.

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
  ("Business + APAC") via YAML-declared lookups.
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
