# Operations Skills

> 9 typical operational scenarios as concrete workflows with MCP tools and
> ClickHouse queries

## Overview

| #   | Skill                            | Trigger                      | Core idea                                        |
| --- | -------------------------------- | ---------------------------- | ------------------------------------------------ |
| 1   | **Incident Triage**              | New incidents, escalation    | Group → pattern → root cause → resolution        |
| 2   | **SLA Monitoring**               | Periodic, alert              | Find running instances above threshold           |
| 3   | **Process Performance Analysis** | Ad-hoc, review               | Throughput, P95, bottlenecks, trends             |
| 4   | **Failed Job Recovery**          | Incidents, monitoring        | Error pattern → batch retry of sensible jobs     |
| 5   | **Process Migration**            | Deployment, version upgrade  | Token distribution → BPMN comparison → migration |
| 6   | **Capacity Planning**            | Weekly, quarterly planning   | Throughput trend → peak load → forecast          |
| 7   | **Audit Trail**                  | Compliance, debugging        | Complete chronology of one instance              |
| 8   | **Root Cause Analysis**          | Incident, outage             | Incident → OTEL spans → external API failure     |
| 9   | **Comparison Analysis**          | After deployment, regression | Period A vs. B at process and activity level     |

---

## Skill 1: Incident Triage

### Scenario

8:00 AM — 47 open incidents accumulated overnight. The operator has to decide
quickly: which ones are duplicates, what is the root cause, and which can be
resolved in batch?

### Tools involved

| Step                  | Tool / Query                    | Source                |
| --------------------- | ------------------------------- | --------------------- |
| Group incidents       | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Check live status     | `list_incidents`                | camunda7-mcp-server   |
| Pull OTEL error spans | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Resolve incident      | `resolve_incident`              | camunda7-mcp-server   |
| Set job retries       | `set_job_retries`               | camunda7-mcp-server   |

### Workflow

```
1. Incident grouping (ClickHouse)
   → groups by incident_message + activity_id
   → result: 3 groups instead of 47 individual incidents

2. Pattern analysis (ClickHouse)
   → temporal correlation: all between 02:00–02:15
   → affected processes: only "orderProcess"

3. Root cause via OTEL (ClickHouse otel.otel_traces)
   → error spans around 02:00: "Connection refused: payment-service:8080"
   → cause: payment service restart

4. Resolution (camunda7-mcp-server)
   → payment service is back online → batch retry of all 47 jobs
```

### ClickHouse SQL

```sql
-- Step 1: Group incidents
SELECT
    incident_message,
    activity_id,
    process_definition_key,
    count() AS incident_count,
    min(create_time) AS first_occurrence,
    max(create_time) AS last_occurrence,
    groupArray(id) AS incident_ids
FROM camunda_history.camunda_incidents
WHERE state = 'open'
    AND create_time >= now() - INTERVAL 24 HOUR
GROUP BY incident_message, activity_id, process_definition_key
ORDER BY incident_count DESC;

-- Step 3: Correlate OTEL error spans
SELECT
    SpanName,
    ServiceName,
    StatusMessage,
    count() AS error_count,
    min(Timestamp) AS first_error,
    max(Timestamp) AS last_error
FROM otel.otel_traces
WHERE StatusCode = 'ERROR'
    AND Timestamp >= '2026-03-17 02:00:00'
    AND Timestamp <= '2026-03-17 02:30:00'
GROUP BY SpanName, ServiceName, StatusMessage
ORDER BY error_count DESC;
```

### OTEL value-add

Without OTEL, you only see "Service Task failed". With OTEL you see the exact
HTTP call, the status code, and which downstream service was unreachable.

---

## Skill 2: SLA Monitoring

### Scenario

Order processes have a 24h SLA. The operator wants to know: which running
instances are at risk?

### Tools involved

| Step                  | Tool / Query                    | Source                |
| --------------------- | ------------------------------- | --------------------- |
| Find SLA breachers    | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Check active activity | `get_activity_instance_tree`    | camunda7-mcp-server   |
| Inspect variables     | `get_variables`                 | camunda7-mcp-server   |
| Inspect task assignee | `list_tasks`                    | camunda7-mcp-server   |

### Workflow

```
1. Find SLA-endangered instances (ClickHouse)
   → running instances with start_time > SLA threshold
   → ordered by urgency (next SLA deadline first)

2. For the top 5: where are they stuck? (camunda7-mcp-server)
   → activity instance tree → current token positions
   → variables → business context (customer ID, order value)

3. Decide on an action
   → user task blocked? → escalate to team lead
   → service task failed? → resolve incident + retry
   → timer waiting? → send signal to move on
```

### ClickHouse SQL

```sql
-- Running instances above the SLA threshold
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.start_time,
    dateDiff('hour', p.start_time, now()) AS running_hours,
    24 - dateDiff('hour', p.start_time, now()) AS hours_remaining,
    a.activity_id AS current_activity,
    a.activity_name AS current_activity_name,
    a.activity_type,
    a.start_time AS activity_start_time
FROM camunda_history.camunda_process_instances p
LEFT JOIN camunda_history.camunda_activity_instances a
    ON p.id = a.process_instance_id
    AND a.end_time IS NULL
WHERE p.process_definition_key = 'orderProcess'
    AND p.state = 'ACTIVE'
    AND p.start_time < now() - INTERVAL 20 HOUR  -- 80% of SLA consumed
ORDER BY p.start_time ASC
LIMIT 20;
```

### OTEL value-add

OTEL metrics (`mcp.tool.duration_ms`) show whether the engine itself is
responding slowly — i.e. whether the SLA problem sits in the process design
or in the infrastructure.

---

## Skill 3: Process Performance Analysis

### Scenario

The team wants to know: how is the order process performing? Where are the
bottlenecks? Is there a trend?

### Tools involved

| Step                  | Tool / Query                    | Source                |
| --------------------- | ------------------------------- | --------------------- |
| Throughput + duration | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Activity bottlenecks  | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Daily trend           | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Load BPMN             | `get_process_definition_xml`    | camunda7-mcp-server   |

### Workflow

```
1. KPI overview (ClickHouse)
   → throughput (instances/day), median duration, P95, failure rate

2. Activity bottleneck ranking (ClickHouse)
   → which activities consume the most total time?

3. Daily trend (ClickHouse)
   → throughput + duration over the last 30 days

4. BPMN context (camunda7-mcp-server)
   → load the process model to put bottleneck activities in context
```

### ClickHouse SQL

```sql
-- KPI overview
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(duration_in_millis) / 1000, 1) AS median_duration_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_duration_sec,
    round(count() / 30.0, 1) AS instances_per_day
FROM camunda_history.camunda_process_instances
WHERE start_time >= now() - INTERVAL 30 DAY
    AND end_time IS NOT NULL
GROUP BY process_definition_key
ORDER BY total_instances DESC;

-- Daily trend
SELECT
    toDate(start_time) AS day,
    count() AS instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_duration_sec
FROM camunda_history.camunda_process_instances
WHERE process_definition_key = '{process_key}'
    AND start_time >= now() - INTERVAL 30 DAY
    AND end_time IS NOT NULL
GROUP BY day
ORDER BY day;
```

### OTEL value-add

OTEL traces show end-to-end latency including external service calls, so you
can tell whether a bottleneck sits in the process design or in an external
system.

---

## Skill 4: Failed Job Recovery

### Scenario

15 jobs have failed. Some are transient (network timeout), others are
permanent (bad data). Only the transient ones should be retried.

### Tools involved

| Step                   | Tool / Query                    | Source                |
| ---------------------- | ------------------------------- | --------------------- |
| Error pattern analysis | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Job details            | `list_jobs`                     | camunda7-mcp-server   |
| OTEL error details     | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Selective retry        | `set_job_retries`               | camunda7-mcp-server   |

### Workflow

```
1. Error pattern analysis (ClickHouse)
   → group incidents by error message
   → pattern: 8x "Connection timeout", 5x "ValidationException", 2x "NullPointer"

2. OTEL error spans (ClickHouse)
   → "Connection timeout" → external service was briefly down, now back up
   → "ValidationException" → bad input data, retry pointless

3. Selective batch retry (camunda7-mcp-server)
   → retry only the 8 "Connection timeout" jobs
   → the 5 "ValidationException" jobs → escalate manually
   → the 2 "NullPointer" jobs → file a bug ticket
```

### ClickHouse SQL

```sql
-- Error pattern analysis
SELECT
    i.incident_message,
    i.activity_id,
    count() AS occurrence_count,
    groupArray(i.process_instance_id) AS affected_instances,
    min(i.create_time) AS first_seen,
    max(i.create_time) AS last_seen,
    -- Heuristic: transient if all in the same time window
    dateDiff('minute', min(i.create_time), max(i.create_time)) AS window_minutes
FROM camunda_history.camunda_incidents i
WHERE i.state = 'open'
    AND i.incident_type = 'failedJob'
GROUP BY i.incident_message, i.activity_id
ORDER BY occurrence_count DESC;
```

### OTEL value-add

OTEL error spans expose the exact HTTP status code and response body of the
failing external call. That makes transient vs. permanent classification much
easier.

---

## Skill 5: Process Migration

### Scenario

A new version of the process is being deployed. 200 running instances need to
migrate from v1 to v2. To do that you need to know where the tokens currently
sit.

### Tools involved

| Step                  | Tool / Query                    | Source                |
| --------------------- | ------------------------------- | --------------------- |
| Token distribution    | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| BPMN of both versions | `get_process_definition_xml`    | camunda7-mcp-server   |
| Running instances     | `list_process_instances`        | camunda7-mcp-server   |
| Activity tree         | `get_activity_instance_tree`    | camunda7-mcp-server   |

### Workflow

```
1. Analyse token distribution (ClickHouse)
   → where are the 200 instances right now?
   → 120 in "approveOrder", 50 in "waitForPayment", 30 in "checkInventory"

2. BPMN comparison (camunda7-mcp-server)
   → load v1 and v2 XML
   → which activities have changed?
   → "approveOrder" unchanged ✓, "checkInventory" renamed to "verifyStock" ✗

3. Migration decision
   → 120 + 50 instances: 1:1 migration possible (activity IDs match)
   → 30 instances in "checkInventory": activity ID mapping required

4. Execute the migration (camunda7-mcp-server)
   → (may require REST API for process instance modification)
```

### ClickHouse SQL

```sql
-- Token distribution: where are running instances?
SELECT
    a.activity_id,
    a.activity_name,
    a.activity_type,
    count() AS instance_count,
    groupArray(a.process_instance_id) AS instance_ids
FROM camunda_history.camunda_activity_instances a
JOIN camunda_history.camunda_process_instances p
    ON a.process_instance_id = p.id
WHERE p.process_definition_key = 'orderProcess'
    AND p.state = 'ACTIVE'
    AND a.end_time IS NULL  -- currently active activities
GROUP BY a.activity_id, a.activity_name, a.activity_type
ORDER BY instance_count DESC;
```

### OTEL value-add

After the migration, OTEL traces show whether migrated instances continue
successfully or whether new errors appear.

---

## Skill 6: Capacity Planning

### Scenario

Quarterly planning: how many instances do we process per week? How is the
trend developing? Will the current infrastructure last for the next 3 months?

### Tools involved

| Step                      | Tool / Query                    | Source                |
| ------------------------- | ------------------------------- | --------------------- |
| Weekly throughput         | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Peak load analysis        | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Engine utilization (OTEL) | `run_select_query` (ClickHouse) | clickhouse-mcp-server |

### Workflow

```
1. Throughput trend (ClickHouse)
   → instances per week over the last 12 weeks
   → trend: +8% per week

2. Peak load (ClickHouse)
   → maximum instances per hour
   → peak: Monday 09:00–10:00, 3x average

3. Engine performance (OTEL)
   → engine.http.duration_ms trend: stable at P95 = 200ms
   → no performance degradation despite rising volume

4. Forecast
   → at +8%/week → in 12 weeks: ~2.5x current volume
   → engine P95 still has headroom → infrastructure is fine for now
```

### ClickHouse SQL

```sql
-- Weekly throughput trend
SELECT
    toMonday(start_time) AS week_start,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec
FROM camunda_history.camunda_process_instances
WHERE start_time >= now() - INTERVAL 12 WEEK
    AND end_time IS NOT NULL
GROUP BY week_start
ORDER BY week_start;

-- Peak load per hour
SELECT
    toStartOfHour(start_time) AS hour,
    toDayOfWeek(start_time) AS day_of_week,
    count() AS instances_started
FROM camunda_history.camunda_process_instances
WHERE start_time >= now() - INTERVAL 4 WEEK
GROUP BY hour, day_of_week
ORDER BY instances_started DESC
LIMIT 20;

-- OTEL: engine latency trend
SELECT
    toDate(Timestamp) AS day,
    quantile(0.5)(Duration / 1000000) AS p50_ms,
    quantile(0.95)(Duration / 1000000) AS p95_ms,
    quantile(0.99)(Duration / 1000000) AS p99_ms
FROM otel.otel_traces
WHERE ServiceName = 'camunda7-mcp-server'
    AND SpanName LIKE 'engine.http%'
    AND Timestamp >= now() - INTERVAL 12 WEEK
GROUP BY day
ORDER BY day;
```

### OTEL value-add

Without OTEL you only get process throughput. With OTEL you also get the
actual engine latency and can spot infrastructure bottlenecks before they
become a problem.

---

## Skill 7: Audit Trail

### Scenario

Compliance request: "Show me the complete chronology of order 12345 — every
step, every change, every access."

### Tools involved

| Step          | Tool / Query                    | Source                |
| ------------- | ------------------------------- | --------------------- |
| Find instance | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Full history  | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| OTEL traces   | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Live status   | `get_process_instance`          | camunda7-mcp-server   |

### Workflow

```
1. Find the instance via business key (ClickHouse)
   → variable "orderId" = "12345" → process_instance_id

2. Full chronology (ClickHouse)
   → UNION ALL across all 5 history tables
   → time-sorted: start → activities → tasks → variables → end

3. Add OTEL traces (ClickHouse)
   → all spans for that instance
   → external calls visible (Payment API, email service, etc.)

4. Summary
   → chronological timeline with all events + external interactions
```

### ClickHouse SQL

```sql
-- Full chronology of one process instance
WITH target AS (
    SELECT process_instance_id
    FROM camunda_history.camunda_variable_updates
    WHERE variable_name = 'orderId' AND text_value = '12345'
    LIMIT 1
)
SELECT * FROM (
    -- Process instance events
    SELECT
        start_time AS event_time,
        'PROCESS' AS event_category,
        'started' AS event_type,
        concat('Process started: ', process_definition_key) AS description,
        '' AS actor
    FROM camunda_history.camunda_process_instances
    WHERE id = (SELECT process_instance_id FROM target)

    UNION ALL

    SELECT
        end_time AS event_time,
        'PROCESS' AS event_category,
        'ended' AS event_type,
        concat('Process ', state, ' after ', toString(duration_in_millis), 'ms') AS description,
        '' AS actor
    FROM camunda_history.camunda_process_instances
    WHERE id = (SELECT process_instance_id FROM target)
        AND end_time IS NOT NULL

    UNION ALL

    -- Activity events
    SELECT
        start_time AS event_time,
        'ACTIVITY' AS event_category,
        concat(activity_type, '_started') AS event_type,
        concat(activity_name, ' (', activity_id, ')') AS description,
        coalesce(assignee, '') AS actor
    FROM camunda_history.camunda_activity_instances
    WHERE process_instance_id = (SELECT process_instance_id FROM target)

    UNION ALL

    -- Task events
    SELECT
        start_time AS event_time,
        'TASK' AS event_category,
        'task_created' AS event_type,
        concat('Task: ', name, ' → ', coalesce(assignee, 'unassigned')) AS description,
        coalesce(assignee, '') AS actor
    FROM camunda_history.camunda_task_instances
    WHERE process_instance_id = (SELECT process_instance_id FROM target)

    UNION ALL

    -- Variable changes
    SELECT
        timestamp AS event_time,
        'VARIABLE' AS event_category,
        'variable_updated' AS event_type,
        concat(variable_name, ' = ', coalesce(text_value, toString(long_value), toString(double_value), 'null')) AS description,
        '' AS actor
    FROM camunda_history.camunda_variable_updates
    WHERE process_instance_id = (SELECT process_instance_id FROM target)

    UNION ALL

    -- Incidents
    SELECT
        create_time AS event_time,
        'INCIDENT' AS event_category,
        'incident_created' AS event_type,
        concat(incident_type, ': ', coalesce(incident_message, 'no message')) AS description,
        '' AS actor
    FROM camunda_history.camunda_incidents
    WHERE process_instance_id = (SELECT process_instance_id FROM target)
)
ORDER BY event_time ASC;
```

### OTEL value-add

OTEL traces extend the audit trail with external interactions: which APIs
were called when, with what parameters? Often decisive for compliance audits.

---

## Skill 8: Root Cause Analysis

### Scenario

A critical process is failing. The incident only says "Service Task failed".
You need the actual root cause — often an external service.

### Tools involved

| Step             | Tool / Query                    | Source                |
| ---------------- | ------------------------------- | --------------------- |
| Load incident    | `list_incidents`                | camunda7-mcp-server   |
| OTEL error spans | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Span hierarchy   | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| History context  | `run_select_query` (ClickHouse) | clickhouse-mcp-server |

### Workflow

```
1. Incident details (camunda7-mcp-server)
   → incident on activity "callPaymentService"
   → error: "java.lang.RuntimeException: HTTP 503"

2. Find OTEL error spans (ClickHouse)
   → all error spans within the incident time window
   → span: "HTTP POST payment-service/api/charge" → 503 Service Unavailable

3. Analyse span hierarchy (ClickHouse)
   → parent span: "engine.http POST /process-instance/.../execute"
   → root span: "mcp.tool.complete_task"
   → context: user completed task → engine ran service task → payment API down

4. Extended analysis (ClickHouse)
   → how often did payment-service fail in the last 24h?
   → is there a pattern (e.g. always on the hour)?

5. Resolution suggestion
   → payment service is back online → retry the job
   → or: recommend retry pattern with backoff in the process model
```

### ClickHouse SQL

```sql
-- OTEL: error spans around the incident time
SELECT
    TraceId,
    SpanId,
    ParentSpanId,
    SpanName,
    ServiceName,
    Duration / 1000000 AS duration_ms,
    StatusCode,
    StatusMessage,
    SpanAttributes['http.status_code'] AS http_status,
    SpanAttributes['http.url'] AS http_url,
    SpanAttributes['http.method'] AS http_method
FROM otel.otel_traces
WHERE StatusCode = 'ERROR'
    AND Timestamp >= '{incident_time}' - INTERVAL 5 MINUTE
    AND Timestamp <= '{incident_time}' + INTERVAL 5 MINUTE
ORDER BY Timestamp;

-- Span hierarchy for one trace
SELECT
    SpanId,
    ParentSpanId,
    SpanName,
    ServiceName,
    Duration / 1000000 AS duration_ms,
    StatusCode,
    StatusMessage
FROM otel.otel_traces
WHERE TraceId = '{trace_id}'
ORDER BY Timestamp;

-- Payment service error history (24h)
SELECT
    toStartOfHour(Timestamp) AS hour,
    count() AS error_count,
    groupUniqArray(SpanAttributes['http.status_code']) AS status_codes
FROM otel.otel_traces
WHERE ServiceName IN ('cibseven-engine', 'camunda7-mcp-server')
    AND SpanName LIKE '%payment%'
    AND StatusCode = 'ERROR'
    AND Timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour;
```

### OTEL value-add

This is THE OTEL use case. Without tracing you only see "Service Task failed"
— with OTEL you see the exact HTTP call, the status code, the response time,
and you can analyse the failure history of the external service.

---

## Skill 9: Comparison Analysis

### Scenario

A new process version was deployed last week. The team wants to know: is the
new version faster? Are there more errors? Has the bottleneck shifted?

### Tools involved

| Step                    | Tool / Query                    | Source                |
| ----------------------- | ------------------------------- | --------------------- |
| KPI comparison          | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Activity comparison     | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| OTEL latency comparison | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| BPMN of both versions   | `get_process_definition_xml`    | camunda7-mcp-server   |

### Workflow

```
1. Process-level comparison (ClickHouse)
   → period A (before deploy) vs. period B (after deploy)
   → throughput, duration, failure rate

2. Activity-level comparison (ClickHouse)
   → has the bottleneck shifted?
   → new activities in v2? Removed activities from v1?

3. OTEL latency comparison (ClickHouse)
   → engine HTTP latency: unchanged?
   → external service calls: any change?

4. BPMN comparison (camunda7-mcp-server)
   → load v1 and v2 XML
   → identify structural differences
```

### ClickHouse SQL

```sql
-- Process-level comparison: period A vs. B
SELECT
    CASE
        WHEN start_time < '{deploy_date}' THEN 'Period A (before)'
        ELSE 'Period B (after)'
    END AS period,
    count() AS total_instances,
    countIf(state = 'COMPLETED') AS completed,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct,
    round(avg(duration_in_millis) / 1000, 1) AS avg_duration_sec,
    round(quantile(0.5)(duration_in_millis) / 1000, 1) AS median_sec,
    round(quantile(0.95)(duration_in_millis) / 1000, 1) AS p95_sec
FROM camunda_history.camunda_process_instances
WHERE process_definition_key = '{process_key}'
    AND end_time IS NOT NULL
    AND start_time >= '{deploy_date}' - INTERVAL 7 DAY
    AND start_time <= '{deploy_date}' + INTERVAL 7 DAY
GROUP BY period
ORDER BY period;

-- Activity-level comparison
SELECT
    a.activity_id,
    a.activity_name,
    CASE
        WHEN p.start_time < '{deploy_date}' THEN 'Period A'
        ELSE 'Period B'
    END AS period,
    count() AS executions,
    round(avg(a.duration_in_millis) / 1000, 1) AS avg_sec,
    round(quantile(0.95)(a.duration_in_millis) / 1000, 1) AS p95_sec,
    round(sum(a.duration_in_millis) / 1000, 1) AS total_sec
FROM camunda_history.camunda_activity_instances a
JOIN camunda_history.camunda_process_instances p
    ON a.process_instance_id = p.id
WHERE p.process_definition_key = '{process_key}'
    AND a.end_time IS NOT NULL
    AND p.start_time >= '{deploy_date}' - INTERVAL 7 DAY
    AND p.start_time <= '{deploy_date}' + INTERVAL 7 DAY
GROUP BY a.activity_id, a.activity_name, period
ORDER BY a.activity_id, period;
```

### OTEL value-add

OTEL shows whether performance gains come from the process redesign or from
infrastructure changes (e.g. a faster DB). Without OTEL these effects can't
be separated.

---

## How the skills interact

The skills build on each other and share common building blocks:

```
                    ClickHouse history tables          OTEL traces/metrics
                    ──────────────────────            ──────────────────
                             │                                │
              ┌──────────────┼──────────────┐                 │
              │              │              │                 │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐    ┌─────▼─────┐
        │ Incident  │ │ SLA       │ │Performance│    │Root Cause │
        │ Triage    │ │ Monitoring│ │ Analysis  │    │ Analysis  │
        │ (Skill 1) │ │ (Skill 2) │ │ (Skill 3) │    │ (Skill 8) │
        └─────┬─────┘ └───────────┘ └─────┬─────┘    └─────┬─────┘
              │                            │                 │
        ┌─────▼─────┐              ┌──────▼──────┐          │
        │ Failed Job│              │ Comparison  │          │
        │ Recovery  │              │ Analysis    │          │
        │ (Skill 4) │              │ (Skill 9)   │          │
        └───────────┘              └─────────────┘          │
                                                            │
        ┌───────────┐  ┌───────────┐  ┌─────────────────────▼─┐
        │ Process   │  │ Capacity  │  │ Audit Trail           │
        │ Migration │  │ Planning  │  │ (Skill 7)             │
        │ (Skill 5) │  │ (Skill 6) │  │ History + OTEL        │
        └───────────┘  └───────────┘  └───────────────────────┘
```

### Cross-skill references

| Skill                   | Builds on                                     |
| ----------------------- | --------------------------------------------- |
| Failed Job Recovery (4) | Incident Triage (1) for error patterns        |
| Process Migration (5)   | Performance Analysis (3) for bottleneck info  |
| Capacity Planning (6)   | Performance Analysis (3) for baseline metrics |
| Root Cause Analysis (8) | Incident Triage (1) for initial grouping      |
| Comparison Analysis (9) | Performance Analysis (3) as baseline          |
| Audit Trail (7)         | Root Cause Analysis (8) for OTEL correlation  |
