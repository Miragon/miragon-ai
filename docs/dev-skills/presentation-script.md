# Presentation script — Dev Skills on `seed-presentation`

> A 20-minute live demo that walks through all five Dev Skills with concrete,
> reproducible outputs. Each step lists the exact invocation, an expected
> snippet of output, the talking point, and a fallback in case the live
> demo stumbles.

## 0. Setup (do this before you start presenting)

1. **Truncate the ClickHouse history** (optional but recommended for a clean
   narrative — old seed runs accumulate and can skew the numbers in the
   skill reports):

   ```bash
   docker exec docker-clickhouse-1 clickhouse-client --user camunda \
     --password camunda123 --database camunda_history --multiquery --query "
     TRUNCATE TABLE camunda_process_instances;
     TRUNCATE TABLE camunda_activity_instances;
     TRUNCATE TABLE camunda_task_instances;
     TRUNCATE TABLE camunda_variable_updates;
     TRUNCATE TABLE camunda_incidents;
   "
   ```

2. **Boot the example with the presentation profile:**

   ```bash
   SPRING_PROFILES_ACTIVE=seed-presentation CLICKHOUSE_ENABLED=true \
     ./gradlew :examples:cibseven-example:bootRun
   ```

   Wait until the log shows `miraveloLeasing seeding complete`. Expect ~600
   instances, ~5–20 s seed time on a warm daemon (cached ClockUtil advances
   make this much quicker than real-time job execution).

3. **Start the MCP servers** (`camunda7-mcp`, `analytics-mcp`, `enrichment-mcp`) —
   see [running-skills.md §3](running-skills.md).

4. **Verify connectivity** from Claude Code:

   ```
   claude mcp tools
   ```

   All three servers should report active tools.

5. **Note the deployment IDs** you'll need for UC5:

   ```
   Use camunda7_list_deployments.
   ```

   Write down (a) the `miraveloLeasing` deployment id and (b) the
   `assessCreditworthiness` deployment id. For the REGRESSED demo you also
   need the rollback-era anchor — see UC5 step below.

## 1. Demo flow (20 minutes, 5 skills, 1 showcase process)

Recommended ordering — each step is self-contained but tells a richer story
when played in sequence.

### Step 1 — UC1: onboard to an unfamiliar process (3 min)

Invocation:

```
/dev-process-explain miraveloLeasing 30d
```

Expect in the output:

- Dominant creditworthy path (~92%) from Start → call activity → Send policy
  → end at `Event_PolicyIssued`
- Risk-identified branch (~8%) that surfaces the `Activity_DecideOnApplication` user task
- Suppressed paths: FAX channel (~1%), Decision accelerated via 2 h timer
  (~0.5%) — both below minBucketSize=10
- Bottleneck section highlights `Activity_CheckBlacklist` ("Check blacklist") in the
  sub-process for the first 15 seed days

**Talking point.** "I've never seen this process before — in 30 seconds
the skill told me what actually runs, where time is spent, and where it
breaks. No BPMN reading, no instance inspection."

**Fallback.** If enrichment is missing, the segment block is omitted with
a note — the rest of the output still stands.

### Step 2 — UC4: turn production behavior into tests (3 min)

Invocation:

```
/dev-test-scenarios-from-production miraveloLeasing 30d junit
```

Expect in the output:

- One `@Test` per ≥5%-share path (creditworthy, risk+positive, risk+negative)
- BRANCH intake as an additional scenario (~2% share)
- FAX channel + timer escalation listed but **not** mapped — minBucketSize
  suppression
- Equivalence-class comment for `bikeModel`: {city, trail, road} (cargo
  excluded — see UC6 DEAD)

**Talking point.** "These aren't made-up fixtures. Every variable value is
a bucket representative from real production distributions — cross-region
scenarios a human would never have invented from memory."

**Fallback.** Re-run with `bpm-assert` as the framework — output is more
readable at the top of the transcript.

### Step 3 — UC2: categorical change impact (3 min)

Invocation:

```
/dev-change-impact "route APAC instances through the BUSINESS policy template instead of the default"
```

Expect in the output:

- Identified element: `Activity_DeliverPolicy` ("Delivery bike leasing policy") of
  `miraveloLeasing`
- Reclassification count: ~180 instances (~33% of APAC traffic)
- Affected segments: APAC splits ~45% BUSINESS / ~50% PRIVATE / ~5% STUDENT

**Talking point.** "Before we commit, we know the blast radius — 180
instances/month, a third of APAC traffic, without touching a single
instance record."

**Fallback 1.** If categorical analysis isn't available in the running
analytics-mcp build, fall back to the numeric threshold example:
`/dev-change-impact plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/delegates/CheckCreditScoreDelegate.kt:22`
(targets `creditScore < 550 → BAD_CREDIT_SCORE`).

**Fallback 2.** Boolean angle:
`/dev-change-impact "default priorityFlag to true for customerSegment=BUSINESS"`.

### Step 4 — UC6: is this code still alive? (4 min)

Run two invocations back-to-back to show the full verdict spectrum:

**4a — DEAD verdict.**

```
/dev-code-archaeology "leasing instances where bikeModel == 'cargo' && leaseTermMonths > 24"
```

Expect: **DEAD** — 0 observations in 365d, no suppression (seed caps cargo
bikes at 24 months).

**Talking point.** "The skill doesn't guess. The combined distribution has
enough observations to trust zero — this branch is provably unreachable."

**4b — ALIVE-but-rare.**

```
/dev-code-archaeology "instances where channel == 'BRANCH'"
```

Expect: **ALIVE (rare)** — ~2% of instances, above minBucketSize=10, last
run inside the post-fix era. Recommendation: keep the path, don't delete.

**Talking point.** "Conversely, this feels dead but isn't — 2% is above
minBucketSize, and the last occurrence was two days ago."

**Fallback.** If the joint-distribution query isn't exposed, anchor on the
FAX channel instead: `/dev-code-archaeology "channel == 'FAX'"` → expected
**UNKNOWN** (suppressed) — makes the point about the three-state verdict
(ALIVE / DEAD / UNKNOWN) equally well.

### Step 5 — UC5: did the fix actually work? (4 min)

Run two invocations to contrast IMPROVED and REGRESSED verdicts.

**5a — IMPROVED.** Target the blacklist-outage cutoff in the sub-process
(approximately now − 15 days):

```
/dev-fix-verification <assessCreditworthiness-deploymentId> assessCreditworthiness Activity_CheckBlacklist 7
```

Expect: **IMPROVED** — incident rate drops from ~13% to <1% across the
7-day window.

**5b — REGRESSED.** Target a deployment whose timestamp centers on the
rollback-era band on the parent process (approximately now − 8.5 days):

```
/dev-fix-verification <miraveloLeasing-rollback-deploymentId> miraveloLeasing Activity_SendPolicy 3
```

Expect: **REGRESSED** — incident rate jumps from ~0% to ~9% in the 3-day
window right after the rollout.

**Talking point.** "Two deployments on the same showcase — one on the
sub-process, one on the parent — same verdict machinery, opposite outcomes.
The dev ships with evidence, not feeling."

**Fallback.** If only one deployment is exposed (MCP tool returns a
filtered list), demo IMPROVED only — the regression story can be told
verbally with the analytics data still on screen.

### Step 6 — Wrap-up (3 min)

Show the **aggregates-only policy**: none of the outputs leaked a single
instance identifier. Bucket representatives, path IDs, and counts —
nothing that would trip a data-governance review.

Mention the three-profile seeder: CI runs `seed-minimal` for regression
checks, dev workstations use `seed` (backward compat), this demo used
`seed-presentation`.

## 2. Troubleshooting during a live demo

| Symptom                               | Fix                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `suppressed: true` on every bucket    | The window is too narrow or seed boot hasn't completed. Widen to `90d` or wait.        |
| `Tool not available`                  | MCP server isn't attached. `claude mcp tools` lists the active set.                    |
| Timer escalation missing from UC6 alt | Seed boot was interrupted before risk-identified instances finished — restart profile. |
| Enrichment segments blank             | `ENRICHMENT_CONFIG_PATH` not pointed at `miraveloLeasing-local.yaml` / WireMock down.  |
| REGRESSED demo returns IMPROVED       | Wrong deployment id picked — choose the one whose timestamp sits at `~now - 8.5d`.     |
