# UC-O2 — `ops-failed-job-recovery`

> "Payment-service just recovered. Retry every failed job that was a timeout
> against it — but don't re-queue the validation errors."

## Scenario

After a downstream outage, Cockpit's Batches → Failed Jobs view is full. The
operator wants to empty it — but if she multi-selects everything and clicks
"increment retries", the permanent failures in the pile get re-executed too
and just burn compute. This skill classifies the cohort first (transient
vs. permanent, by exception class), then retries only the transient group.

## Invocation

```
/ops-failed-job-recovery [processDefinitionKey] [errorPattern] [dryRun]
```

- `processDefinitionKey` — optional. Restrict to one definition.
- `errorPattern` — optional. Case-insensitive substring filter on the error
  message. E.g. `timeout`, `503`, `payment-service`.
- `dryRun` — optional boolean. Default `false`. If `true`, Step 6 is skipped.

## Tools involved

| Step                      | Tool                             | Server         | Writes? |
| ------------------------- | -------------------------------- | -------------- | ------- |
| List failed jobs          | `camunda7_list_jobs`             | `camunda7-mcp` | no      |
| List failed-job incidents | `camunda7_list_incidents`        | `camunda7-mcp` | no      |
| Bump retries (preferred)  | `camunda7_set_job_retries_batch` | `camunda7-mcp` | **yes** |
| Bump retries (fallback)   | `camunda7_set_job_retries`       | `camunda7-mcp` | **yes** |

The batch path is one call that returns a `batchId`; progress and per-item
failures land on the batch (Cockpit → Batches) rather than inline. The
per-job fallback is only used if the batch tool is unavailable in the active
MCP deployment.

## Workflow

```
1. List the failed-job cohort
   → camunda7_list_jobs(noRetriesLeft: true, maxResults: 500)
   → camunda7_list_incidents(incidentType: failedJob, maxResults: 500)
   → merge by jobId (incident.configuration carries the jobId)

2. Apply errorPattern (if provided)
   → case-insensitive substring on the merged incident message

3. Classify
   → first exception class via regex (\b[A-Z]\w+(Exception|Error)\b)
   → transient: Timeout, Connect, refused, unreachable, 5xx, IOException,
                SocketException, RetryableException
   → permanent: Validation, NullPointer, ClassCast, IllegalArgument,
                NumberFormat, 4xx, ConstraintViolation, ParseException
   → unknown:   neither bucket matched
   → group by (exceptionClass, activityId), sum counts

4. Render the recovery report
   → Summary + Groups table + proposed action + caveats

5. Confirmation gate — print and STOP
   → "retry | all | no"    (all = transient + unknown, not recommended)

6. Execute (skipped in dryRun)
   → preferred: camunda7_set_job_retries_batch(jobIds: [...], retries: 3) — one
                call, returns batchId; per-item failures land on the batch
   → fallback:  for each transient jobId → camunda7_set_job_retries(jobId, 3)
                (only if the batch tool is unavailable; loop never aborts)

7. Post-verify
   → repeat Step 1 with identical filters
   → diff: failed before N → after M, retries=S, failures=[...]

8. Hand off
   → suggest ops-instance-inspect-unblock on a sample from the permanent/unknown
     buckets for a targeted next look
```

## Example output (truncated)

```markdown
# Failed-job recovery for `loanApproval` filter=`timeout`

## Summary

- Failed jobs in scope: **17**
- Transient (retry candidates): 12 across 1 group
- Permanent (do not retry): 3 across 1 group
- Unknown: 2 across 1 group

## Groups

| #   | Count | Activity               | Classification | Error class              | Sample message            |
| --- | ----: | ---------------------- | -------------- | ------------------------ | ------------------------- |
| 1   |    12 | `Task_notifyApplicant` | Transient      | `SocketTimeoutException` | `timed out after 30000ms` |
| 2   |     3 | `Task_validateAmount`  | Permanent      | `ValidationException`    | `amount must be positive` |
| 3   |     2 | `Task_bankTransfer`    | Unknown        | `RuntimeException`       | `unexpected state`        |

## Proposed action

- Retry 12 transient jobs (set retries = 3).
- Leave 3 permanent jobs for manual review — retrying will burn cycles.
- Leave 2 unknown jobs for manual review.

> Confirm? Type one of:
> retry — set retries = 3 for the 12 transient jobs
> all — retry transient AND unknown (not recommended)
> no — abort
```

After a `retry` confirmation:

```markdown
## After

- Failed jobs before: **17**
- Failed jobs after: **5**
- Retries executed: 12 success, 0 failed
- Failures: none
```

## Context policy

- Job, incident, and instance ids are cited verbatim.
- Error messages are truncated to ~200 chars per row to keep the table legible
  — full message is available per job via `camunda7_list_jobs` in follow-up.
- No variable values are quoted.

## When _not_ to use it

- When the cohort is well-understood to be entirely one error (e.g. you just
  patched the service and want every single blocked job back in flight) — a
  narrow `errorPattern` + `all` confirmation is the fast path, but
  [UC-O1](ops-incident-triage.md) handles the same cohort through the
  incident layer if you also need the incidents cleared.
- When you suspect permanent failures are wedging the instance itself (not
  just the job) — [UC-O3](ops-instance-inspect-unblock.md) gives the full
  token-position view before you decide what to do.
