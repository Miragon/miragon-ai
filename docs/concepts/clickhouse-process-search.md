# Smart process instance search via ClickHouse

> LLM-driven search over historical process data with cross-reference to the
> engine REST API

## Design philosophy

The LLM uses **two MCP servers in parallel**:

| MCP Server              | Purpose                                     | Data access     |
| ----------------------- | ------------------------------------------- | --------------- |
| `camunda7-mcp-server`   | Live data, actions (claim, complete, retry) | Engine REST API |
| `clickhouse-mcp-server` | Historical analysis, search, aggregation    | ClickHouse SQL  |

```
User: "Find all order processes that failed last week"

LLM
 ├── clickhouse-mcp-server: run_select_query
 │     → SQL on camunda_history.camunda_process_instances + camunda_incidents
 │     → Result: list of process_instance_ids with failure details
 │
 └── camunda7-mcp-server: get_process_instance / list_incidents
       → live status, current variables, open tasks
       → action: resolve_incident, set_job_retries
```

The LLM decides on its own which server to use for which part of the request.

## Query pattern library

### Pattern 1: Find failed instances

```sql
-- Failed process instances with incident details
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    i.incident_type,
    i.incident_message,
    i.activity_id AS failed_activity,
    i.create_time AS incident_time
FROM camunda_history.camunda_process_instances p
JOIN camunda_history.camunda_incidents i
    ON p.id = i.process_instance_id
WHERE p.process_definition_key = '{process_key}'
    AND p.state = 'INTERNALLY_TERMINATED'
    AND p.start_time >= now() - INTERVAL 7 DAY
ORDER BY p.start_time DESC
LIMIT 50;
```

### Pattern 2: Variable-based search

```sql
-- Find process instances by variable value
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.state,
    p.start_time,
    v.variable_name,
    v.text_value,
    v.long_value
FROM camunda_history.camunda_process_instances p
JOIN camunda_history.camunda_variable_updates v
    ON p.id = v.process_instance_id
WHERE v.variable_name = '{variable_name}'
    AND v.text_value = '{search_value}'
ORDER BY v.timestamp DESC
LIMIT 50;
```

### Pattern 3: Slow instances (P95 comparison)

```sql
-- Instances that are slower than P95
WITH stats AS (
    SELECT
        process_definition_key,
        quantile(0.95)(duration_in_millis) AS p95_duration,
        avg(duration_in_millis) AS avg_duration
    FROM camunda_history.camunda_process_instances
    WHERE end_time IS NOT NULL
        AND start_time >= now() - INTERVAL 30 DAY
    GROUP BY process_definition_key
)
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.start_time,
    p.duration_in_millis,
    s.p95_duration,
    s.avg_duration,
    round(p.duration_in_millis / s.avg_duration, 2) AS slowdown_factor
FROM camunda_history.camunda_process_instances p
JOIN stats s ON p.process_definition_key = s.process_definition_key
WHERE p.duration_in_millis > s.p95_duration
    AND p.end_time IS NOT NULL
    AND p.start_time >= now() - INTERVAL 30 DAY
ORDER BY slowdown_factor DESC
LIMIT 20;
```

### Pattern 4: OTEL trace → process instance correlation

```sql
-- Navigate from an OTEL trace to the process instance
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.state,
    p.trace_id,
    t.SpanName,
    t.Duration AS span_duration_ns,
    t.StatusCode
FROM camunda_history.camunda_process_instances p
JOIN otel.otel_traces t ON p.trace_id = t.TraceId
WHERE t.TraceId = '{trace_id}'
ORDER BY t.Timestamp;

-- Reverse: all traces for one process instance
SELECT
    t.TraceId,
    t.SpanName,
    t.ServiceName,
    t.Duration / 1000000 AS duration_ms,
    t.StatusCode,
    t.SpanAttributes
FROM otel.otel_traces t
JOIN camunda_history.camunda_process_instances p
    ON t.TraceId = p.trace_id
WHERE p.id = '{process_instance_id}'
ORDER BY t.Timestamp;
```

### Pattern 5: Bottleneck analysis

```sql
-- Activity duration ranking: where do instances spend the most time?
SELECT
    activity_id,
    activity_name,
    activity_type,
    count() AS execution_count,
    avg(duration_in_millis) AS avg_duration_ms,
    quantile(0.5)(duration_in_millis) AS median_duration_ms,
    quantile(0.95)(duration_in_millis) AS p95_duration_ms,
    max(duration_in_millis) AS max_duration_ms,
    sum(duration_in_millis) AS total_time_ms,
    round(sum(duration_in_millis) * 100.0 / (
        SELECT sum(duration_in_millis)
        FROM camunda_history.camunda_activity_instances
        WHERE process_definition_key = '{process_key}'
            AND end_time IS NOT NULL
            AND start_time >= now() - INTERVAL 30 DAY
    ), 2) AS pct_of_total_time
FROM camunda_history.camunda_activity_instances
WHERE process_definition_key = '{process_key}'
    AND end_time IS NOT NULL
    AND start_time >= now() - INTERVAL 30 DAY
GROUP BY activity_id, activity_name, activity_type
ORDER BY total_time_ms DESC
LIMIT 20;
```

## Cross-reference workflow

Typical flow for a search via ClickHouse followed by an action:

```
1. User request
   "Find order 12345 and show me why it's stuck"

2. ClickHouse search (clickhouse-mcp-server)
   SELECT p.id, p.state, i.incident_message, i.activity_id
   FROM camunda_process_instances p
   LEFT JOIN camunda_incidents i ON p.id = i.process_instance_id
   JOIN camunda_variable_updates v ON p.id = v.process_instance_id
   WHERE v.variable_name = 'orderId' AND v.text_value = '12345'
   → Result: process_instance_id = "abc-123", incident on "sendInvoice"

3. Live details (camunda7-mcp-server)
   get_process_instance({ id: "abc-123" })
   get_activity_instance_tree({ id: "abc-123" })
   get_variables({ id: "abc-123" })
   list_incidents({ processInstanceId: "abc-123" })
   → Result: current token positions, variable values, incident details

4. Action (camunda7-mcp-server)
   resolve_incident({ id: "incident-456" })
   set_job_retries({ id: "job-789", retries: 1 })
   → Result: incident resolved, job will be retried
```

## Optional new MCP tools

These tools would be implemented as a convenience layer in
`camunda7-mcp-server` and query ClickHouse directly:

### 1. `search_process_instances`

```typescript
// Universal search over process instances
{
  name: 'search_process_instances',
  description: 'Search historic process instances using flexible criteria via ClickHouse',
  inputSchema: z.object({
    processDefinitionKey: z.string().optional(),
    businessKey: z.string().optional(),
    state: z.enum(['ACTIVE', 'COMPLETED', 'INTERNALLY_TERMINATED', 'EXTERNALLY_TERMINATED']).optional(),
    startedAfter: z.string().optional(),  // ISO datetime
    startedBefore: z.string().optional(),
    durationGreaterThan: z.number().optional(),  // ms
    withIncidents: z.boolean().optional(),
    variableFilter: z.object({
      name: z.string(),
      value: z.string(),
    }).optional(),
    sortBy: z.enum(['startTime', 'endTime', 'duration']).default('startTime'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.number().default(20),
  }),
}
```

### 2. `analyze_process_performance`

```typescript
// Bottleneck analysis for a process
{
  name: 'analyze_process_performance',
  description: 'Analyze process performance: throughput, P95 duration, bottleneck activities',
  inputSchema: z.object({
    processDefinitionKey: z.string(),
    period: z.enum(['1d', '7d', '30d', '90d']).default('7d'),
    includeActivityBreakdown: z.boolean().default(true),
  }),
}
```

### 3. `find_failed_instances`

```typescript
// Failed instances with incident context
{
  name: 'find_failed_instances',
  description: 'Find failed process instances with incident details and error patterns',
  inputSchema: z.object({
    processDefinitionKey: z.string().optional(),
    period: z.enum(['1d', '7d', '30d']).default('7d'),
    incidentType: z.string().optional(),
    groupByError: z.boolean().default(false),
    limit: z.number().default(20),
  }),
}
```

### 4. `search_by_variable`

```typescript
// Variable-based search
{
  name: 'search_by_variable',
  description: 'Search process instances by variable name and value',
  inputSchema: z.object({
    variableName: z.string(),
    variableValue: z.string(),
    processDefinitionKey: z.string().optional(),
    limit: z.number().default(20),
  }),
}
```

### 5. `trace_process_execution`

```typescript
// Combine OTEL traces + history
{
  name: 'trace_process_execution',
  description: 'Combine OTEL traces with process history for end-to-end execution visibility',
  inputSchema: z.object({
    processInstanceId: z.string(),
    includeOtelSpans: z.boolean().default(true),
    includeActivityHistory: z.boolean().default(true),
    includeVariableChanges: z.boolean().default(false),
  }),
}
```

### 6. `compare_execution_periods`

```typescript
// Period comparison
{
  name: 'compare_execution_periods',
  description: 'Compare process execution metrics between two time periods',
  inputSchema: z.object({
    processDefinitionKey: z.string(),
    periodA: z.object({ from: z.string(), to: z.string() }),
    periodB: z.object({ from: z.string(), to: z.string() }),
    metrics: z.array(z.enum(['throughput', 'duration', 'failureRate', 'bottlenecks'])).default(['throughput', 'duration']),
  }),
}
```

## ClickHouse HTTP client for the MCP server

If the optional tools are implemented, the MCP server needs its own ClickHouse
client:

```typescript
// packages/camunda7-mcp-server/src/clickhouse-client.ts
export interface ClickHouseConfig {
  url: string // e.g. http://localhost:8123
  user: string
  password: string
  database: string // e.g. camunda_history
}

export interface ClickHouseClient {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>
}

export function createClickHouseClient(config: ClickHouseConfig): ClickHouseClient {
  const { url, user, password, database } = config

  return {
    async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      const response = await fetch(`${url}/?database=${database}&default_format=JSONEachRow`, {
        method: "POST",
        headers: {
          "X-ClickHouse-User": user,
          "X-ClickHouse-Key": password,
          "Content-Type": "text/plain",
        },
        body: sql,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`ClickHouse query failed (${response.status}): ${error}`)
      }

      const text = await response.text()
      if (!text.trim()) return []

      return text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as T)
    },
  }
}
```

## Configuration extension

New environment variables for the MCP server:

| Variable              | Default                 | Description                |
| --------------------- | ----------------------- | -------------------------- |
| `CLICKHOUSE_URL`      | `http://localhost:8123` | ClickHouse HTTP endpoint   |
| `CLICKHOUSE_USER`     | `camunda`               | ClickHouse user            |
| `CLICKHOUSE_PASSWORD` | `camunda123`            | ClickHouse password        |
| `CLICKHOUSE_DATABASE` | `camunda_history`       | Default database           |
| `CLICKHOUSE_ENABLED`  | `false`                 | Enable ClickHouse features |

These are only relevant if the optional MCP tools are implemented. Without
them, search works through the separate `clickhouse-mcp-server`.

## Decision matrix: own tools vs. clickhouse-mcp-server

| Criterion          | Own tools in camunda7-mcp-server           | Separate clickhouse-mcp-server     |
| ------------------ | ------------------------------------------ | ---------------------------------- |
| **Flexibility**    | Fixed patterns, but type-safe              | Arbitrary SQL, maximum flexibility |
| **Security**       | Read-only, parameterized, no SQL injection | LLM generates SQL — risk           |
| **UX**             | Domain-specific parameters                 | LLM has to know the schema         |
| **Effort**         | Implement 6 new tools                      | Already exists                     |
| **Recommendation** | For frequent patterns                      | For ad-hoc analyses                |

**Recommendation**: Use both approaches in parallel. The 6 tools for the most
common operations workflows; `clickhouse-mcp-server` for exploratory analysis.
