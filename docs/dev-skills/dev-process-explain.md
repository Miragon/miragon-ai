# UC1 — `dev-process-explain`

> "I have to ship a feature on this process tomorrow. I didn't write it. What
> does it actually do?"

## Scenario

A developer is pulled onto a Camunda 7 process she has never seen. She could
open the BPMN and read the Java code — but neither BPMN nor code reveal which
paths actually run in production, where the bottlenecks are, or who triggers
the edge cases. The skill produces a **behavior-first onboarding doc** that
answers those questions in one shot.

## Invocation

```
/dev-process-explain <processDefinitionKey> [period: 1d|7d|30d|90d]
```

- `processDefinitionKey` — required. If missing, the skill asks once.
- `period` — optional, default `30d`.

## Tools involved

| Step              | Tool                                  | Server                      |
| ----------------- | ------------------------------------- | --------------------------- |
| Load BPMN         | `camunda7_get_process_definition_xml` | `camunda7-mcp`              |
| Delegate code     | `Read`, `Grep`, `Glob`                | Workspace                   |
| Path distribution | `analytics_path_frequency`            | `analytics-mcp`             |
| Bottlenecks       | `analytics_element_bottleneck`        | `analytics-mcp`             |
| Segment naming    | `enrichment_auto_resolve`             | `enrichment-mcp` (optional) |

## Workflow

```
1. Extract BPMN structure
   → start/end events, service and user tasks, gateways, listeners
   → remember element IDs (referenced by every later step)

2. Read delegate code
   → for each camunda:class / delegateExpression find the source file
   → read only as much as needed to understand the contract (inputs, side effects)

3. Query path frequency
   → analytics_path_frequency (minBucketSize=10, limit=20)
   → dominant path, secondary paths, long tail, suppressed

4. Bottlenecks
   → analytics_element_bottleneck with the same key + period
   → hot elements, slow elements, error-prone elements

5. Segment characterization (optional)
   → call enrichment_auto_resolve for representative variable names
   → "Path B is almost exclusively Enterprise + multi-currency"

6. Compose the onboarding doc
```

## Example output (truncated, against the `cibseven-example` seed)

```markdown
# Process: loanApproval

## TL;DR

A simple approval process for loan applications. The dominant path is the
rejection through `Task_notifyApplicant` (~58%); approvals run as the user
task `Task_bankTransfer`. A rare legacy channel (`channel="FAX"`) stays below
the minBucketSize threshold at under 1%.

## Behavior in production (last 30d)

- Path A (Rejected): 58% — `StartEvent_1 → Task_0dfv74n → Gateway_approved → Task_notifyApplicant → EndEvent_rejected`
- Path B (Approved + transfer): 31% — ends on `EndEvent_approved` with `Task_bankTransfer` completed
- Path C (Approved + pending transfer): 11% — `Task_bankTransfer` still in the inbox
- Suppressed: 1 path (FAX channel) below minBucketSize=10

## Where the time goes

- `Task_0dfv74n` (userTask "Check the request"): avg 3.1h, p95 28h — user latency, long tail of multiple days
- `Task_bankTransfer` (userTask, candidateGroup=accounting): avg 5.4h, p95 36h
- `Task_notifyApplicant` (serviceTask, asyncBefore): avg 45ms, p95 120ms — uneventful outside the buggy era

## Where it breaks

- `Task_notifyApplicant`: 8.2% failure rate **only during the first 15 seed days**
  (delegate `com.camunda7mcp.example.cibseven.NotifyApplicantDelegate`,
  RuntimeException "Downstream notification service unreachable"). After the
  fix cutoff, below 0.5%.

## Segment characterization

Rejections concentrate at `amount > 100,000` and `customerSegment="PRIVATE"`;
Enterprise instances get approved disproportionately often despite high
amounts. `channel="FAX"` runs almost exclusively through the reject side —
likely tied to the legacy partner.

## Code map

| Element ID           | Type        | Class / Expression                                       |
| -------------------- | ----------- | -------------------------------------------------------- |
| Task_0dfv74n         | userTask    | `assignee=demo`                                          |
| Gateway_approved     | exclusive   | `${approved == true}` / `${approved == false}`           |
| Task_bankTransfer    | userTask    | `candidateGroups=accounting`                             |
| Task_notifyApplicant | serviceTask | `${notifyApplicantDelegate}` — `NotifyApplicantDelegate` |
```

## Context policy

- **No instance quotes.** No customer name, order number, or variable content
  ends up in the doc.
- BPMN element IDs, delegate FQNs, gateway conditions: yes, verbatim.
- If enrichment is missing, the segment section is dropped with a note "not
  configured".

## When _not_ to use it

- When there is no production history (`suppressed`: true on every path) —
  the skill then only delivers BPMN structure + code contract, which manual
  reading would do equally well.
- When you are chasing a specific symptom (debugging, single instance) — for
  that, [UC5](dev-fix-verification.md) or direct SQL access is the better
  tool.
