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
   → "Path B is almost exclusively Business + APAC"

6. Compose the onboarding doc
```

## Example output (truncated, against the `cibseven-example` seed)

```markdown
# Process: miraveloLeasing

## TL;DR

Miravelo's bike-leasing inquiry process. The dominant path is the creditworthy
customer that receives a policy (~92%); a smaller "risk identified" branch
routes through a human decision before issuing or rejecting. A rarely-used
FAX channel (`channel="FAX"`) stays below the minBucketSize threshold at ~1%.
A 2 h non-interrupting timer on the decision task occasionally spawns a
parallel "Accelerate decision making" branch.

## Behavior in production (last 30d)

- Path A (Creditworthy → Policy issued): 92% — ends at `Event_PolicyIssued` after
  `Activity_SendPolicy` (Send policy) and `Activity_DeliverPolicy` (Delivery)
- Path B (Risk identified → positive decision → Policy issued): 5.6% —
  routes through `Activity_DecideOnApplication` (Decide on application), then joins path A
- Path C (Risk identified → negative decision → Policy rejected): 2.4% —
  ends at `Event_PolicyRejected` via `Activity_RejectPolicy` + `Activity_SendRejection`
- Suppressed: 2 paths (FAX channel ~1%, Decision accelerated via timer ~0.8%)
  below minBucketSize=10

## Where the time goes

- `Activity_DecideOnApplication` (userTask "Decide on application"): avg 2.4h, p95 9h —
  user latency; small long tail beyond the 2 h timer boundary
- `Activity_ResolveCustomer` (serviceTask "Create or resolve customer from CRM"):
  avg 90ms, p95 240ms
- `Activity_CheckBlacklist` (serviceTask "Check blacklist", asyncBefore, runs in
  `assessCreditworthiness` sub-process): avg 35ms, p95 110ms — uneventful
  outside the buggy era

## Where it breaks

- `Activity_CheckBlacklist` (sub-process "Check blacklist"): 12.8% failure rate
  **only during the first 15 seed days** (delegate
  `com.camunda7mcp.example.cibseven.delegates.CheckBlacklistDelegate`,
  RuntimeException "Blacklist provider unreachable (simulated)"). After the
  fix cutoff, below 0.5%.

## Segment characterization

Rejections concentrate at `creditScore < 550` and `customerSegment="PRIVATE"`;
BUSINESS instances pass the credit check disproportionately often.
`channel="FAX"` runs almost exclusively through the Risk-identified branch —
likely tied to manually-entered legacy intake.

## Code map

| Element ID                      | Type         | Class / Expression                                    |
| ------------------------------- | ------------ | ----------------------------------------------------- |
| Activity_ResolveCustomer        | serviceTask  | `${createOrResolveCustomerDelegate}`                  |
| Activity_AssessCreditworthiness | callActivity | `calledElement="assessCreditworthiness"`              |
| Gateway_Creditworthy            | exclusive    | `${creditworthy == true}` / else (risk-identified)    |
| Activity_DecideOnApplication    | userTask     | `assignee=demo` (2 h non-interrupting boundary timer) |
| Gateway_Decision                | exclusive    | `${decision == "positive"}` / default (negative)      |
| Activity_SendPolicy             | sendTask     | `${sendPolicyDelegate}` — asyncBefore                 |
| Activity_RejectPolicy           | serviceTask  | `${rejectLeasingPolicyDelegate}`                      |
```

## Second presentation example (against the `assessCreditworthiness` sub-process)

The call activity's sub-process is a standalone deployment. Pointing UC1 at it
surfaces three BPMN-error boundary events on the credit/postal/blacklist checks
and the two terminal end events ("Customer creditworthy" / "Risk identified").

```
/dev-process-explain assessCreditworthiness 30d
```

Expected output shape (truncated):

```markdown
# Process: assessCreditworthiness

## TL;DR

Sub-process called from `miraveloLeasing`. Three sequential checks (credit
score, postal code, blacklist) each raise a BPMN error if they fail, all
routed to the shared "Risk identified" end event (`Event_RiskIdentified`). Happy
path ends at `Event_CustomerCreditworthy` ("Customer creditworthy").

## Where it breaks

- `Activity_CheckBlacklist` ("Check blacklist", asyncBefore): elevated failure rate
  during the first 15 seed days; drops to 0 after the cutoff. The delegate
  throws a `RuntimeException` (simulated provider outage), which surfaces as
  a job-level incident and decrements retries — **not** a BPMN error.
```

## Context policy

- **No instance quotes.** No customer name, postal code, or variable content
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
