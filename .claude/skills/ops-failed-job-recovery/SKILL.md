---
name: ops-failed-job-recovery
argument-hint: "[processDefinitionKey] [errorPattern] [dryRun: true|false]"
allowed-tools: Bash(git *), Read, Grep, Glob
description: Batch-retry failed jobs, classifying transient vs. permanent before executing. Use when the user asks "retry failed jobs", "Jobs wiederherstellen", "failed job retry", or wants to empty the failed-job queue after a flaky downstream service recovered. Equivalent to Cockpit's Batches → Failed Jobs retry, but with error-pattern classification so permanent failures are not re-queued.
---

# Skill: ops-failed-job-recovery (UC-O2)

Empty the failed-job queue after a downstream outage — but only the jobs that
actually stand a chance of succeeding on retry.

The operator workflow this replaces is: open Cockpit Batches → Failed Jobs,
eyeball the error messages, multi-select, click "increment retries". That's
cheap until one permanent error slips into the batch and burns extra compute.
This skill classifies first, then retries only the transient group.

## IMPORTANT — context & safety policy

- Ops reports MAY cite individual `jobId`, `processInstanceId`, `incidentId`.
- Every write action requires an explicit user confirmation in the same turn
  (see Step 5 — Confirmation gate).
- When `dryRun: true`, never call `set_job_retries`. Print the plan and stop.
- Per-job errors during execution are captured; they do not abort the loop.

## Inputs

Parse `$ARGUMENTS`:

- **`processDefinitionKey`** — optional. Restrict to one definition.
- **`errorPattern`** — optional. Case-insensitive substring filter on the job's
  error message. E.g. `timeout`, `503`, `payment-service`. If omitted, classify
  all failed jobs.
- **`dryRun`** — optional boolean. Default `false`. If `true`, Step 6 is skipped.

If no arguments are given, proceed with defaults.

## Instructions

### Step 1 — List failed jobs

Call `camunda7_list_jobs`:

```
processDefinitionKey: <if provided>
noRetriesLeft: true
maxResults: 500
sortBy: jobDueDate
sortOrder: desc
```

These are jobs with zero retries — the classic "failed job" cohort.

Also call `camunda7_list_incidents`:

```
incidentType: failedJob
maxResults: 500
```

Merge by `jobId` (incidents carry `configuration: jobId`). The incident gives
you the full error message; the job itself is the target of the retry.

If the set is empty, print "No failed jobs." and stop.

### Step 2 — Apply `errorPattern` filter (if provided)

Keep only jobs whose merged incident message contains `errorPattern`
(case-insensitive). If the filter drops everything, print the unfiltered
count and stop.

### Step 3 — Classify

For each job, extract the first exception class (simple regex — first
`\b[A-Z][A-Za-z0-9_]*(?:Exception|Error)\b` occurrence). Apply:

- **Transient** — the exception class or message contains any of:
  `Timeout`, `Connect`, `refused`, `unreachable`, `SocketException`,
  `IOException`, `503`, `502`, `504`, `RetryableException`.
- **Permanent** — contains any of:
  `Validation`, `NullPointer`, `ClassCast`, `IllegalArgument`, `NumberFormat`,
  `400`, `404`, `ConstraintViolation`, `ParseException`.
- **Unknown** — neither bucket matches.

Group jobs by `(exceptionClass, activityId)` and sum counts.

### Step 4 — Render the recovery report

```markdown
# Failed-job recovery <if key: for `<key>`> <if pattern: filter=`<pattern>`>

## Summary

- Failed jobs in scope: **N**
- Transient (retry candidates): **T** across **Tg** groups
- Permanent (do not retry): **P** across **Pg** groups
- Unknown: **U** across **Ug** groups

## Groups

| #   | Count | Activity             | Classification | Error class              | Sample message                |
| --- | ----: | -------------------- | -------------- | ------------------------ | ----------------------------- |
| 1   |    12 | `callPaymentService` | Transient      | `SocketTimeoutException` | `timed out after 30000ms`     |
| 2   |     3 | `validateOrder`      | Permanent      | `ValidationException`    | `orderTotal must be positive` |
| 3   |     2 | `shipOrder`          | Unknown        | `RuntimeException`       | `unexpected state`            |

## Proposed action

- **Retry 12 transient jobs** (set retries = 3).
- **Leave 3 permanent jobs** for manual review — retrying will burn cycles.
- **Leave 2 unknown jobs** for manual review.

## Caveats

- Classification is heuristic. If `errorPattern` is very specific you may be
  fine skipping the classification and retrying the whole filtered set — use a
  second invocation with a narrow pattern for that.
```

### Step 5 — Confirmation gate

If `dryRun: true`, skip to Step 7 with a note that no action was taken.

Otherwise, print:

```
> Confirm? Type one of:
>   retry      — set retries = 3 for the 12 transient jobs
>   all        — retry transient AND unknown (not recommended)
>   no         — abort
```

Do not call any write tool before the operator answers.

### Step 6 — Execute

Prefer the batch path; fall back to the per-job loop only if the batch tool is
unavailable in this MCP deployment.

- **retry (batch path, preferred)**: call
  `camunda7_set_job_retries_batch(jobIds: [...transient job ids], retries: 3)`
  once. Capture the returned `batchId`.
- **retry (fallback)**: for each transient `jobId`, call
  `camunda7_set_job_retries(jobId, retries: 3)`. Capture per-item outcome.
- **all**: same, but include the `Unknown` group.

Collect `successes`, `failures` with error messages (batch path: read the
batch progress on re-verify; per-job path: collect inline).

### Step 7 — Post-verify

Repeat Step 1 with identical filters. Diff:

```markdown
## After

- Failed jobs before: **N**
- Failed jobs after: **M**
- Retries executed: **S** success, **F** failed
- Failures: <list of jobId + error, or "none">
```

### Step 8 — Hand off

Print the report. Do not save. For the permanent / unknown groups, hint the
operator toward `ops-instance-inspect-unblock` on a sample instance for a
targeted diagnosis.
