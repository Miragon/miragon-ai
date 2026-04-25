# UC6 — `dev-code-archaeology`

> "This else branch looks like nobody has touched it since 2019. Can I delete
> it?"

## Scenario

The developer stumbles on a code block that feels dead — an old
`if channel == "FAX"` branch, a delegate that no longer seems to be
triggered, a gateway condition with outdated wording. Reading the code is
not enough: the path may still fire once a quarter. The skill combines
**git history + 12-month path frequency** and emits a clear verdict: ALIVE,
DEAD, or UNKNOWN.

## Invocation

```
/dev-code-archaeology <file>:<line>
/dev-code-archaeology "<description of the condition>"
```

Examples (against the `miraveloLeasing` seed):

```
/dev-code-archaeology plugins/examples/cibseven-example/src/main/kotlin/com/camunda7mcp/example/cibseven/seeders/MiraveloLeasingSeeder.kt:357
/dev-code-archaeology "instances where channel == 'FAX'"
```

## Tools involved

| Step                | Tool                                        | Server                      |
| ------------------- | ------------------------------------------- | --------------------------- |
| Anchor the code     | `Read`, `Grep`, `Glob`                      | Workspace                   |
| Git history         | `Bash(git log/blame)`                       | Workspace                   |
| Find BPMN element   | `Grep` over `*.bpmn`                        | Workspace                   |
| Path frequency (1y) | `analytics_path_frequency` with period=365d | `analytics-mcp`             |
| Segment naming      | `enrichment_auto_resolve`                   | `enrichment-mcp` (optional) |

## Workflow

```
1. Anchor the code
   → read file + line, understand condition + variable + surrounding structure
   → record delegate FQN / listener class / gateway condition

2. Resolve the BPMN element
   → grep *.bpmn for delegate FQN or gateway ID
   → determine processDefinitionKey + elementId

3. Git history
   → git blame on the line → last change (author, date, commit)
   → git log on the file → frequency of changes, last change

4. Runtime signal
   → analytics_path_frequency with period=365d, minBucketSize=10
   → how often did the path containing the element run in 12 months?

5. Verdict
   → 0 runs in 365d, suppressed:               UNKNOWN (not DEAD — too little
     data to be sure)
   → 0 runs in 365d, not suppressed:           DEAD
   → <N> runs in 365d, very rare:              ALIVE but rare (with segment
     context, when available)
   → regular:                                  ALIVE

6. Phrase a recommendation
```

## Example output (against the `miraveloLeasing` seed)

```markdown
# Archaeology: MiraveloLeasingSeeder.kt:357 — `channel == "FAX"`

## Verdict

**UNKNOWN**

The FAX channel has been observed **< minBucketSize=10** times in the last
30 seed days. The result is `suppressed: true` — not "dead", just below the
aggregation threshold. Don't delete without lowering the threshold or
extending the observation window.

## Runtime

- Path share (365d simulated through the seed): ~0.5–1% (2 observations)
- Last run: within the post-fix era
- Element: routing variable `channel` in `miraveloLeasing`
- `analytics_path_frequency` returns the path as `suppressed`, not as a
  row.

## Git history

- Last changed: 2026-04-22 (Miravelo migration, commit on `dominikhorn93/madison`)
- Before that: 2026-04-14 (initial seeder scaffold, legacy era)
- The `channel` variable is deliberately set with a 1% FAX rate — the
  motivation is the archaeology scenario itself.

## Segment

Segment characterization skipped: too few observations for
`enrichment_auto_resolve` to aggregate stably.

## Recommendation

Don't delete. Options for answering the liveness question cleanly:

- Extend the observation window (`90d`, possibly `180d`).
- Temporarily lower `minBucketSize` in the analytics query to 1 (with a
  note in the report that aggregation no longer applies).
- Or mark the path in the code (`@LegacyPath`) and re-check after a
  quarter.
```

## Second presentation example: DEAD verdict (`seed-presentation`)

The `seed-presentation` profile hard-caps cargo-bike lease terms at 24
months in the seeder, so the condition `bikeModel == "cargo" && leaseTermMonths

> 24` is **structurally unreachable** — not rare, not suppressed, genuinely
> zero observations over any window.

```
/dev-code-archaeology "leasing instances where bikeModel == 'cargo' && leaseTermMonths > 24"
```

Expected output shape (truncated):

```markdown
# Archaeology: cargo bikes leased for more than 24 months

## Verdict

**DEAD**

0 matching instances over the full 365-day window. The combined
distribution `(bikeModel × leaseTermMonths-bucket)` has 600+ observations
total — more than enough to trust zero. No suppression flag.

## Runtime

- `analytics_variable_distribution` on `bikeModel`: "cargo" appears in
  ~25% of instances, bucket size well above minBucketSize=10.
- `analytics_variable_distribution` on `leaseTermMonths`: 36 and 48 each
  appear in ~25% of instances.
- Joint occurrence: 0 — cap enforced in the seeder / production code
  (upstream validation capping cargo lease terms at 24 months).

## Recommendation

Safe to delete any code path gated on this combination — the condition is
provably unreachable given current upstream validation.
```

**Third angle — ALIVE-but-rare.** The BRANCH channel sits at ~2% share,
above minBucketSize=10 but rare enough that a dev might question whether
it still runs.

```
/dev-code-archaeology "instances where channel == 'BRANCH'"
```

Expected verdict: **ALIVE (rare)** — used by ~2% of instances, last
occurrence within the post-fix era. Do not delete; keep the path gated.

## Context policy

- Git metadata (hash, author, timestamp, commit message) is **quoted
  verbatim**.
- Variable contents are not — only condition text is quoted verbatim, never
  the observed values.
- **UNKNOWN is not a fig leaf.** When the path has zero runs and the result
  is suppressed (because `minBucketSize=10` was undershot), the skill says
  "I can't decide for sure" — not "probably dead". The decision is up to
  the dev, not the skill.

## When _not_ to use it

- For questions about code _quality_ ("is this written well?") — the skill
  says nothing about that, that is review work.
- When the path can't be bound to a BPMN element (pure utility code without
  process context) — the skill then only delivers git history, which you
  get without the skill anyway.
