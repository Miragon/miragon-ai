# Intelligente Prozessinstanz-Suche über ClickHouse

> LLM-gesteuerte Suche über historische Prozessdaten mit Cross-Referenz zur Engine REST API

## Design-Philosophie

Das LLM nutzt **zwei MCP-Server parallel**:

| MCP Server              | Zweck                                         | Datenzugriff    |
| ----------------------- | --------------------------------------------- | --------------- |
| `camunda7-mcp-server`   | Live-Daten, Aktionen (claim, complete, retry) | Engine REST API |
| `clickhouse-mcp-server` | Historische Analyse, Suche, Aggregation       | ClickHouse SQL  |

```
User: "Finde alle Bestellprozesse die letzte Woche fehlgeschlagen sind"

LLM
 ├── clickhouse-mcp-server: run_select_query
 │     → SQL auf camunda_history.camunda_process_instances + camunda_incidents
 │     → Ergebnis: Liste von process_instance_ids mit Fehlerdetails
 │
 └── camunda7-mcp-server: get_process_instance / list_incidents
       → Live-Status, aktuelle Variables, offene Tasks
       → Aktion: resolve_incident, set_job_retries
```

Das LLM entscheidet selbstständig, welchen Server es für welchen Teil der Anfrage nutzt.

## Query-Pattern-Bibliothek

### Pattern 1: Fehlgeschlagene Instanzen finden

```sql
-- Fehlgeschlagene Prozessinstanzen mit Incident-Details
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

### Pattern 2: Variable-basierte Suche

```sql
-- Prozessinstanzen über Variablenwert finden
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

### Pattern 3: Langsame Instanzen (P95-Vergleich)

```sql
-- Instanzen die langsamer als P95 sind
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

### Pattern 4: OTEL Trace → Prozessinstanz-Korrelation

```sql
-- Von einem OTEL Trace zur Prozessinstanz navigieren
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

-- Umgekehrt: Alle Traces für eine Prozessinstanz
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

### Pattern 5: Bottleneck/Engpass-Analyse

```sql
-- Activity-Dauer-Ranking: Wo verbringen Instanzen die meiste Zeit?
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

## Cross-Referenz Workflow

Der typische Ablauf bei einer Suche über ClickHouse mit anschließender Aktion:

```
1. User-Anfrage
   "Finde die Bestellung 12345 und zeige mir warum sie hängt"

2. ClickHouse-Suche (clickhouse-mcp-server)
   SELECT p.id, p.state, i.incident_message, i.activity_id
   FROM camunda_process_instances p
   LEFT JOIN camunda_incidents i ON p.id = i.process_instance_id
   JOIN camunda_variable_updates v ON p.id = v.process_instance_id
   WHERE v.variable_name = 'orderId' AND v.text_value = '12345'
   → Ergebnis: process_instance_id = "abc-123", Incident auf "sendInvoice"

3. Live-Details (camunda7-mcp-server)
   get_process_instance({ id: "abc-123" })
   get_activity_instance_tree({ id: "abc-123" })
   get_variables({ id: "abc-123" })
   list_incidents({ processInstanceId: "abc-123" })
   → Ergebnis: Aktueller Token-Stand, Variable-Werte, Incident-Details

4. Aktion (camunda7-mcp-server)
   resolve_incident({ id: "incident-456" })
   set_job_retries({ id: "job-789", retries: 1 })
   → Ergebnis: Incident aufgelöst, Job wird erneut versucht
```

## Optionale neue MCP-Tools

Diese Tools würden als Convenience-Layer im `camunda7-mcp-server` implementiert und ClickHouse direkt abfragen:

### 1. `search_process_instances`

```typescript
// Universelle Suche über Process Instances
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
// Engpass-Analyse für einen Prozess
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
// Fehlgeschlagene Instanzen mit Incident-Kontext
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
// Variable-basierte Suche
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
// OTEL Traces + History zusammenführen
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
// Zeitraum-Vergleich
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

## ClickHouse HTTP-Client für den MCP Server

Falls die optionalen Tools implementiert werden, braucht der MCP Server einen eigenen ClickHouse-Client:

```typescript
// packages/camunda7-mcp-server/src/clickhouse-client.ts
export interface ClickHouseConfig {
  url: string // z.B. http://localhost:8123
  user: string
  password: string
  database: string // z.B. camunda_history
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

## Konfigurationserweiterung

Neue Environment-Variablen für den MCP Server:

| Variable              | Default                 | Beschreibung                   |
| --------------------- | ----------------------- | ------------------------------ |
| `CLICKHOUSE_URL`      | `http://localhost:8123` | ClickHouse HTTP-Endpunkt       |
| `CLICKHOUSE_USER`     | `camunda`               | ClickHouse Benutzer            |
| `CLICKHOUSE_PASSWORD` | `camunda123`            | ClickHouse Passwort            |
| `CLICKHOUSE_DATABASE` | `camunda_history`       | Standard-Datenbank             |
| `CLICKHOUSE_ENABLED`  | `false`                 | ClickHouse-Features aktivieren |

Diese sind nur relevant, wenn die optionalen MCP-Tools implementiert werden. Ohne diese Tools funktioniert die Suche über den separaten `clickhouse-mcp-server`.

## Entscheidungsmatrix: Eigene Tools vs. clickhouse-mcp-server

| Kriterium        | Eigene Tools im camunda7-mcp-server           | Separater clickhouse-mcp-server       |
| ---------------- | --------------------------------------------- | ------------------------------------- |
| **Flexibilität** | Feste Patterns, dafür typsicher               | Beliebiges SQL, maximale Flexibilität |
| **Sicherheit**   | Read-only, parametrisiert, kein SQL-Injection | LLM generiert SQL — Risiko            |
| **UX**           | Domänen-spezifische Parameter                 | LLM muss Schema kennen                |
| **Aufwand**      | 6 neue Tools implementieren                   | Bereits vorhanden                     |
| **Empfehlung**   | Für häufige Patterns                          | Für Ad-hoc-Analysen                   |

**Empfehlung**: Beide Ansätze parallel nutzen. Die 6 Tools für die häufigsten Operations-Workflows, `clickhouse-mcp-server` für explorative Analysen.
