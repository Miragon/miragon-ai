# ClickHouse Schema

All tables live in the `camunda_history` database and use `ReplacingMergeTree`
for deduplication.

## Tables

### `camunda_process_instances`

| Column                    | Type                    | Description                  |
| ------------------------- | ----------------------- | ---------------------------- |
| `id`                      | String                  | Process instance id          |
| `process_definition_id`   | String                  | Definition id                |
| `process_definition_key`  | String                  | Definition key               |
| `process_definition_name` | Nullable(String)        | Definition name              |
| `business_key`            | Nullable(String)        | Business key                 |
| `start_time`              | DateTime64(3)           | Start time                   |
| `end_time`                | Nullable(DateTime64(3)) | End time                     |
| `duration_in_millis`      | Nullable(UInt64)        | Duration in ms               |
| `state`                   | String                  | ACTIVE, COMPLETED, …         |
| `engine_type`             | String                  | camunda7, cibseven, operaton |
| `trace_id`                | Nullable(String)        | OTEL trace id                |

ORDER BY: `(process_definition_key, start_time, id)`

### `camunda_activity_instances`

| Column                | Type             | Description              |
| --------------------- | ---------------- | ------------------------ |
| `id`                  | String           | Activity instance id     |
| `activity_id`         | String           | BPMN activity id         |
| `activity_name`       | Nullable(String) | Activity name            |
| `activity_type`       | String           | serviceTask, userTask, … |
| `process_instance_id` | String           | Owning process instance  |
| `duration_in_millis`  | Nullable(UInt64) | Duration in ms           |
| `trace_id`            | Nullable(String) | OTEL trace id            |

ORDER BY: `(process_definition_key, process_instance_id, start_time, id)`

### `camunda_task_instances`

User task lifecycle including assignee, priority, due date.

ORDER BY: `(process_definition_key, process_instance_id, start_time, id)`

### `camunda_variable_updates`

Variable changes with `text_value`, `long_value`, `double_value`.

ORDER BY: `(process_definition_key, process_instance_id, variable_name, timestamp)`

### `camunda_incidents`

Incidents with `incident_type`, `incident_message`, cause / root-cause chain,
`trace_id`.

ORDER BY: `(process_definition_key, create_time, id)`

## OTEL tables

When the OTEL Collector is configured with the ClickHouse exporter, the
following tables are auto-created in the `otel` database:

- `otel.otel_traces` — spans with attributes
- `otel.otel_metrics_sum` — aggregated metrics
- `otel.otel_logs` — log entries

The `trace_id` column on the history tables enables JOINs between history
events and OTEL traces.
