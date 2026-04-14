# Operations Skills

> 9 typische Betriebsszenarien als konkrete Workflows mit MCP-Tools und ClickHouse-Queries

## Übersicht

| # | Skill | Trigger | Kernidee |
|---|-------|---------|----------|
| 1 | **Incident Triage** | Neue Incidents, Eskalation | Gruppieren → Pattern → Root Cause → Resolution |
| 2 | **SLA Monitoring** | Regelmäßig, Alert | Laufende Instanzen über Schwellwert finden |
| 3 | **Process Performance Analysis** | Ad-hoc, Review | Durchsatz, P95, Bottlenecks, Trends |
| 4 | **Failed Job Recovery** | Incidents, Monitoring | Error-Pattern → Batch-Retry sinnvoller Jobs |
| 5 | **Process Migration** | Deployment, Versionsupdate | Token-Verteilung → BPMN-Vergleich → Migration |
| 6 | **Capacity Planning** | Wöchentlich, Quartalsplanung | Durchsatz-Trend → Spitzenlast → Prognose |
| 7 | **Audit Trail** | Compliance, Debugging | Vollständige Chronologie einer Instanz |
| 8 | **Root Cause Analysis** | Incident, Ausfall | Incident → OTEL Spans → External API Failure |
| 9 | **Comparison Analysis** | After Deployment, Regression | Zeitraum A vs. B auf Prozess- und Activity-Level |

---

## Skill 1: Incident Triage

### Szenario
Morgens um 8:00 Uhr — 47 offene Incidents über Nacht aufgelaufen. Der Operator muss schnell entscheiden: welche sind gleich, was ist die Root Cause, und welche kann man in Batch resolven?

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Incidents gruppieren | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Live-Status prüfen | `list_incidents` | camunda7-mcp-server |
| OTEL Error-Spans laden | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Incident resolven | `resolve_incident` | camunda7-mcp-server |
| Job-Retries setzen | `set_job_retries` | camunda7-mcp-server |

### Workflow

```
1. Incident-Gruppierung (ClickHouse)
   → Gruppen nach incident_message + activity_id
   → Ergebnis: 3 Gruppen statt 47 einzelne Incidents

2. Pattern-Analyse (ClickHouse)
   → Zeitliche Korrelation: alle zwischen 02:00–02:15
   → Betroffene Prozesse: nur "orderProcess"

3. Root Cause via OTEL (ClickHouse otel.otel_traces)
   → Error-Spans um 02:00: "Connection refused: payment-service:8080"
   → Ursache: Payment-Service Restart

4. Resolution (camunda7-mcp-server)
   → Payment-Service ist wieder online → Batch-Retry aller 47 Jobs
```

### ClickHouse SQL

```sql
-- Schritt 1: Incidents gruppieren
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

-- Schritt 3: OTEL Error-Spans korrelieren
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

### OTEL-Mehrwert
Ohne OTEL: Man sieht nur "Service Task fehlgeschlagen". Mit OTEL: Man sieht den exakten HTTP-Call, den Statuscode, und welcher Downstream-Service nicht erreichbar war.

---

## Skill 2: SLA Monitoring

### Szenario
Bestellprozesse haben ein SLA von 24h. Der Operator möchte wissen: welche laufenden Instanzen sind in Gefahr?

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| SLA-Überschreiter finden | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Aktive Activity prüfen | `get_activity_instance_tree` | camunda7-mcp-server |
| Variablen prüfen | `get_variables` | camunda7-mcp-server |
| Task-Assignee prüfen | `list_tasks` | camunda7-mcp-server |

### Workflow

```
1. SLA-gefährdete Instanzen finden (ClickHouse)
   → Laufende Instanzen mit start_time > SLA-Schwellwert
   → Geordnet nach Dringlichkeit (nächste SLA-Deadline zuerst)

2. Für Top-5: Wo stecken sie? (camunda7-mcp-server)
   → Activity Instance Tree → aktueller Token-Stand
   → Variables → Business-Kontext (Kundennummer, Bestellwert)

3. Aktion entscheiden
   → User Task blockiert? → Eskalation an Team-Lead
   → Service Task fehlgeschlagen? → Incident resolven + Retry
   → Timer wartet? → Signal senden zum Weitergehen
```

### ClickHouse SQL

```sql
-- Laufende Instanzen über SLA-Schwellwert
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
    AND p.start_time < now() - INTERVAL 20 HOUR  -- 80% SLA verbraucht
ORDER BY p.start_time ASC
LIMIT 20;
```

### OTEL-Mehrwert
OTEL Metrics (`mcp.tool.duration_ms`) zeigen ob die Engine selbst langsam antwortet — also ob das SLA-Problem im Prozess-Design oder in der Infrastruktur liegt.

---

## Skill 3: Process Performance Analysis

### Szenario
Das Team möchte wissen: Wie performt der Bestellprozess? Wo sind die Engpässe? Gibt es einen Trend?

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Durchsatz + Dauer | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Activity-Bottlenecks | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Tagestrend | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| BPMN laden | `get_process_definition_xml` | camunda7-mcp-server |

### Workflow

```
1. KPI-Übersicht (ClickHouse)
   → Durchsatz (Instanzen/Tag), Median-Dauer, P95, Fehlerrate

2. Activity-Bottleneck-Ranking (ClickHouse)
   → Welche Activities verbrauchen die meiste Gesamtzeit?

3. Tagestrend (ClickHouse)
   → Durchsatz + Dauer über die letzten 30 Tage

4. BPMN-Kontext (camunda7-mcp-server)
   → Prozessmodell laden um Bottleneck-Activities zu kontextualisieren
```

### ClickHouse SQL

```sql
-- KPI-Übersicht
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

-- Tagestrend
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

### OTEL-Mehrwert
OTEL Traces zeigen die End-to-End-Latenz inklusive externer Service-Calls. So sieht man ob ein Bottleneck im Prozess-Design oder bei einem externen System liegt.

---

## Skill 4: Failed Job Recovery

### Szenario
15 Jobs sind fehlgeschlagen. Einige sind transient (Netzwerk-Timeout), andere permanent (falsche Daten). Nur die transienten sollen retried werden.

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Error-Pattern-Analyse | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Job-Details | `list_jobs` | camunda7-mcp-server |
| OTEL Error-Details | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Selektiver Retry | `set_job_retries` | camunda7-mcp-server |

### Workflow

```
1. Error-Pattern-Analyse (ClickHouse)
   → Incidents nach Fehlermeldung gruppieren
   → Pattern: 8x "Connection timeout", 5x "ValidationException", 2x "NullPointer"

2. OTEL Error-Spans (ClickHouse)
   → "Connection timeout" → externer Service war kurz down, jetzt wieder OK
   → "ValidationException" → fehlerhafte Input-Daten, kein Retry sinnvoll

3. Selektiver Batch-Retry (camunda7-mcp-server)
   → Nur die 8 "Connection timeout" Jobs retrien
   → Die 5 "ValidationException" Jobs → manuell eskalieren
   → Die 2 "NullPointer" Jobs → Bug-Ticket erstellen
```

### ClickHouse SQL

```sql
-- Error-Pattern-Analyse
SELECT
    i.incident_message,
    i.activity_id,
    count() AS occurrence_count,
    groupArray(i.process_instance_id) AS affected_instances,
    min(i.create_time) AS first_seen,
    max(i.create_time) AS last_seen,
    -- Heuristik: Transient wenn alle im gleichen Zeitfenster
    dateDiff('minute', min(i.create_time), max(i.create_time)) AS window_minutes
FROM camunda_history.camunda_incidents i
WHERE i.state = 'open'
    AND i.incident_type = 'failedJob'
GROUP BY i.incident_message, i.activity_id
ORDER BY occurrence_count DESC;
```

### OTEL-Mehrwert
OTEL Error-Spans zeigen den exakten HTTP-Statuscode und Response-Body des fehlgeschlagenen externen Calls. Damit kann man transient vs. permanent besser unterscheiden.

---

## Skill 5: Process Migration

### Szenario
Eine neue Version des Prozesses wird deployed. 200 laufende Instanzen müssen von v1 auf v2 migriert werden. Dafür muss man wissen, wo die Tokens aktuell stehen.

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Token-Verteilung | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| BPMN beider Versionen | `get_process_definition_xml` | camunda7-mcp-server |
| Laufende Instanzen | `list_process_instances` | camunda7-mcp-server |
| Activity Tree | `get_activity_instance_tree` | camunda7-mcp-server |

### Workflow

```
1. Token-Verteilung analysieren (ClickHouse)
   → Wo stehen die 200 Instanzen gerade?
   → 120 in "approveOrder", 50 in "waitForPayment", 30 in "checkInventory"

2. BPMN-Vergleich (camunda7-mcp-server)
   → v1 und v2 XML laden
   → Welche Activities haben sich geändert?
   → "approveOrder" unverändert ✓, "checkInventory" umbenannt zu "verifyStock" ✗

3. Migrationsentscheidung
   → 120 + 50 Instanzen: 1:1 Migration möglich (Activity-IDs gleich)
   → 30 Instanzen in "checkInventory": Activity-ID Mapping nötig

4. Migration durchführen (camunda7-mcp-server)
   → (Erfordert ggf. REST API für Process Instance Modification)
```

### ClickHouse SQL

```sql
-- Token-Verteilung: Wo stehen laufende Instanzen?
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
    AND a.end_time IS NULL  -- aktuell aktive Activities
GROUP BY a.activity_id, a.activity_name, a.activity_type
ORDER BY instance_count DESC;
```

### OTEL-Mehrwert
Nach der Migration zeigen OTEL Traces ob die migrierten Instanzen erfolgreich weiterlaufen oder ob neue Fehler auftreten.

---

## Skill 6: Capacity Planning

### Szenario
Quartalsplanung: Wie viele Instanzen verarbeiten wir pro Woche? Wie entwickelt sich der Trend? Reicht die aktuelle Infrastruktur für die nächsten 3 Monate?

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Wöchentlicher Durchsatz | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Spitzenlast-Analyse | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Engine-Auslastung (OTEL) | `run_select_query` (ClickHouse) | clickhouse-mcp-server |

### Workflow

```
1. Durchsatz-Trend (ClickHouse)
   → Instanzen pro Woche über die letzten 12 Wochen
   → Trend: +8% pro Woche

2. Spitzenlast (ClickHouse)
   → Maximale Instanzen pro Stunde
   → Peak: Montag 09:00–10:00, 3x Durchschnitt

3. Engine-Performance (OTEL)
   → engine.http.duration_ms Trend: stabil bei P95 = 200ms
   → Kein Performance-Degradation trotz steigendem Volumen

4. Prognose
   → Bei +8%/Woche → in 12 Wochen: ~2.5x aktuelles Volumen
   → Engine P95 hat noch Headroom → Infrastruktur reicht vorerst
```

### ClickHouse SQL

```sql
-- Wöchentlicher Durchsatz-Trend
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

-- Spitzenlast pro Stunde
SELECT
    toStartOfHour(start_time) AS hour,
    toDayOfWeek(start_time) AS day_of_week,
    count() AS instances_started
FROM camunda_history.camunda_process_instances
WHERE start_time >= now() - INTERVAL 4 WEEK
GROUP BY hour, day_of_week
ORDER BY instances_started DESC
LIMIT 20;

-- OTEL: Engine-Latenz-Trend
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

### OTEL-Mehrwert
Ohne OTEL hat man nur Prozess-Durchsatz. Mit OTEL sieht man auch die tatsächliche Engine-Latenz und kann Infrastructure-Bottlenecks erkennen bevor sie zum Problem werden.

---

## Skill 7: Audit Trail

### Szenario
Compliance-Anfrage: "Zeige mir die vollständige Chronologie der Bestellung 12345 — jeder Schritt, jede Änderung, jeder Zugriff."

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Instanz finden | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Vollständige Historie | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| OTEL Traces | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Live-Status | `get_process_instance` | camunda7-mcp-server |

### Workflow

```
1. Instanz über Business Key finden (ClickHouse)
   → variable "orderId" = "12345" → process_instance_id

2. Vollständige Chronologie (ClickHouse)
   → UNION ALL über alle 5 History-Tabellen
   → Zeitlich sortiert: Start → Activities → Tasks → Variables → End

3. OTEL Traces dazuladen (ClickHouse)
   → Alle Spans für diese Instanz
   → Externe Calls sichtbar (Payment-API, Email-Service, etc.)

4. Zusammenfassung
   → Chronologische Timeline mit allen Events + externen Interaktionen
```

### ClickHouse SQL

```sql
-- Vollständige Chronologie einer Prozessinstanz
WITH target AS (
    SELECT process_instance_id
    FROM camunda_history.camunda_variable_updates
    WHERE variable_name = 'orderId' AND text_value = '12345'
    LIMIT 1
)
SELECT * FROM (
    -- Process Instance Events
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

    -- Activity Events
    SELECT
        start_time AS event_time,
        'ACTIVITY' AS event_category,
        concat(activity_type, '_started') AS event_type,
        concat(activity_name, ' (', activity_id, ')') AS description,
        coalesce(assignee, '') AS actor
    FROM camunda_history.camunda_activity_instances
    WHERE process_instance_id = (SELECT process_instance_id FROM target)

    UNION ALL

    -- Task Events
    SELECT
        start_time AS event_time,
        'TASK' AS event_category,
        'task_created' AS event_type,
        concat('Task: ', name, ' → ', coalesce(assignee, 'unassigned')) AS description,
        coalesce(assignee, '') AS actor
    FROM camunda_history.camunda_task_instances
    WHERE process_instance_id = (SELECT process_instance_id FROM target)

    UNION ALL

    -- Variable Changes
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

### OTEL-Mehrwert
OTEL Traces ergänzen den Audit Trail um externe Interaktionen: Welche APIs wurden wann mit welchen Parametern aufgerufen? Für Compliance-Audits oft entscheidend.

---

## Skill 8: Root Cause Analysis

### Szenario
Ein kritischer Prozess schlägt fehl. Das Incident sagt nur "Service Task failed". Man braucht die tatsächliche Root Cause — oft ein externer Service.

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| Incident laden | `list_incidents` | camunda7-mcp-server |
| OTEL Error-Spans | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Span-Hierarchie | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| History-Kontext | `run_select_query` (ClickHouse) | clickhouse-mcp-server |

### Workflow

```
1. Incident-Details (camunda7-mcp-server)
   → Incident auf Activity "callPaymentService"
   → Fehler: "java.lang.RuntimeException: HTTP 503"

2. OTEL Error-Spans finden (ClickHouse)
   → Alle Error-Spans im Zeitfenster des Incidents
   → Span: "HTTP POST payment-service/api/charge" → 503 Service Unavailable

3. Span-Hierarchie analysieren (ClickHouse)
   → Parent-Span: "engine.http POST /process-instance/.../execute"
   → Root-Span: "mcp.tool.complete_task"
   → Kontext: User hat Task completed → Engine hat Service Task ausgeführt → Payment API down

4. Erweiterte Analyse (ClickHouse)
   → Wie oft ist payment-service in den letzten 24h ausgefallen?
   → Gibt es ein Muster (z.B. immer zur vollen Stunde)?

5. Resolution-Vorschlag
   → Payment-Service ist wieder online → Job retrien
   → Oder: Retry-Pattern mit Backoff im Prozessmodell empfehlen
```

### ClickHouse SQL

```sql
-- OTEL: Error-Spans um den Incident-Zeitpunkt
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

-- Span-Hierarchie für einen Trace
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

-- Payment-Service Fehler-Historie (24h)
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

### OTEL-Mehrwert
Dies ist DER Use Case für OTEL. Ohne Tracing sieht man nur "Service Task failed" — mit OTEL sieht man den exakten HTTP-Call, den Statuscode, die Response-Time, und kann die Fehlerhistorie des externen Service analysieren.

---

## Skill 9: Comparison Analysis

### Szenario
Letzte Woche wurde eine neue Prozessversion deployed. Das Team möchte wissen: Ist die neue Version schneller? Gibt es mehr Fehler? Hat sich das Bottleneck verschoben?

### Beteiligte Tools

| Schritt | Tool / Query | Quelle |
|---------|-------------|--------|
| KPI-Vergleich | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| Activity-Vergleich | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| OTEL-Latenz-Vergleich | `run_select_query` (ClickHouse) | clickhouse-mcp-server |
| BPMN beider Versionen | `get_process_definition_xml` | camunda7-mcp-server |

### Workflow

```
1. Prozess-Level-Vergleich (ClickHouse)
   → Periode A (vor Deploy) vs. Periode B (nach Deploy)
   → Durchsatz, Dauer, Fehlerrate

2. Activity-Level-Vergleich (ClickHouse)
   → Hat sich das Bottleneck verschoben?
   → Neue Activities in v2? Entfernte Activities aus v1?

3. OTEL-Latenz-Vergleich (ClickHouse)
   → Engine-HTTP-Latenz: gleich geblieben?
   → Externe Service-Calls: Veränderung?

4. BPMN-Vergleich (camunda7-mcp-server)
   → v1 und v2 XML laden
   → Strukturelle Unterschiede identifizieren
```

### ClickHouse SQL

```sql
-- Prozess-Level-Vergleich: Periode A vs. B
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

-- Activity-Level-Vergleich
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

### OTEL-Mehrwert
OTEL zeigt ob Performance-Verbesserungen aus dem Prozess-Redesign kommen oder aus Infrastructure-Änderungen (z.B. schnellere DB). Ohne OTEL sind diese Effekte nicht trennbar.

---

## Zusammenspiel der Skills

Die Skills bauen aufeinander auf und nutzen gemeinsame Bausteine:

```
                    ClickHouse History Tables          OTEL Traces/Metrics
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

### Cross-Skill Referenzen

| Skill | Nutzt Erkenntnisse aus |
|-------|----------------------|
| Failed Job Recovery (4) | Incident Triage (1) für Error-Patterns |
| Process Migration (5) | Performance Analysis (3) für Bottleneck-Wissen |
| Capacity Planning (6) | Performance Analysis (3) für Baseline-Metriken |
| Root Cause Analysis (8) | Incident Triage (1) für initiale Gruppierung |
| Comparison Analysis (9) | Performance Analysis (3) als Baseline |
| Audit Trail (7) | Root Cause Analysis (8) für OTEL-Korrelation |
