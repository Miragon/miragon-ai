# ClickHouse Schema

Alle Tabellen liegen in der Datenbank `camunda_history` und nutzen `ReplacingMergeTree` für Deduplizierung.

## Tabellen

### `camunda_process_instances`

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `id` | String | Prozessinstanz-ID |
| `process_definition_id` | String | Definition-ID |
| `process_definition_key` | String | Definition-Key |
| `process_definition_name` | Nullable(String) | Definition-Name |
| `business_key` | Nullable(String) | Business Key |
| `start_time` | DateTime64(3) | Startzeit |
| `end_time` | Nullable(DateTime64(3)) | Endzeit |
| `duration_in_millis` | Nullable(UInt64) | Dauer in ms |
| `state` | String | ACTIVE, COMPLETED, etc. |
| `engine_type` | String | camunda7, cibseven, operaton |
| `trace_id` | Nullable(String) | OTEL Trace ID |

ORDER BY: `(process_definition_key, start_time, id)`

### `camunda_activity_instances`

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `id` | String | Activity Instance ID |
| `activity_id` | String | BPMN Activity ID |
| `activity_name` | Nullable(String) | Activity-Name |
| `activity_type` | String | serviceTask, userTask, etc. |
| `process_instance_id` | String | Zugehörige Prozessinstanz |
| `duration_in_millis` | Nullable(UInt64) | Dauer in ms |
| `trace_id` | Nullable(String) | OTEL Trace ID |

ORDER BY: `(process_definition_key, process_instance_id, start_time, id)`

### `camunda_task_instances`

User Task-Lifecycle mit Assignee, Priority, Due Date.

ORDER BY: `(process_definition_key, process_instance_id, start_time, id)`

### `camunda_variable_updates`

Variablen-Änderungen mit `text_value`, `long_value`, `double_value`.

ORDER BY: `(process_definition_key, process_instance_id, variable_name, timestamp)`

### `camunda_incidents`

Incidents mit `incident_type`, `incident_message`, Cause/Root-Cause Chain, `trace_id`.

ORDER BY: `(process_definition_key, create_time, id)`

## OTEL Tabellen

Wenn der OTEL Collector mit ClickHouse Exporter konfiguriert ist, werden automatisch in der Datenbank `otel` erstellt:

- `otel.otel_traces` — Spans mit Attributen
- `otel.otel_metrics_sum` — Aggregierte Metriken
- `otel.otel_logs` — Log-Einträge

Die `trace_id`-Spalte in den History-Tabellen ermöglicht JOINs zwischen History-Events und OTEL-Traces.
