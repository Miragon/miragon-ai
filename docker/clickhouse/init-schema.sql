CREATE DATABASE IF NOT EXISTS camunda_history;

CREATE TABLE IF NOT EXISTS camunda_history.camunda_process_instances (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_definition_name Nullable(String),
    business_key          Nullable(String),
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    start_user_id         Nullable(String),
    start_activity_id     Nullable(String),
    end_activity_id       Nullable(String),
    delete_reason         Nullable(String),
    super_process_instance_id Nullable(String),
    state                 String,
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    trace_id              Nullable(String),
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_history.camunda_activity_instances (
    id                    String,
    parent_activity_instance_id Nullable(String),
    activity_id           String,
    activity_name         Nullable(String),
    activity_type         String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          String,
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    assignee              Nullable(String),
    task_id               Nullable(String),
    caller_process_definition_id Nullable(String),
    caller_process_instance_id Nullable(String),
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    trace_id              Nullable(String),
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_history.camunda_task_instances (
    id                    String,
    task_id               String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          String,
    activity_instance_id  Nullable(String),
    name                  Nullable(String),
    description           Nullable(String),
    assignee              Nullable(String),
    owner                 Nullable(String),
    priority              Int32,
    due_date              Nullable(DateTime64(3)),
    follow_up_date        Nullable(DateTime64(3)),
    start_time            DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    duration_in_millis    Nullable(UInt64),
    delete_reason         Nullable(String),
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, start_time, id)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS camunda_history.camunda_variable_updates (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          Nullable(String),
    activity_instance_id  Nullable(String),
    task_id               Nullable(String),
    variable_name         String,
    variable_type         String,
    serialized_value      Nullable(String),
    text_value            Nullable(String),
    long_value            Nullable(Int64),
    double_value          Nullable(Float64),
    revision              UInt32,
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, process_instance_id, variable_name, timestamp)
PARTITION BY toYYYYMM(timestamp);

CREATE TABLE IF NOT EXISTS camunda_history.camunda_incidents (
    id                    String,
    process_definition_id String,
    process_definition_key String,
    process_instance_id   String,
    execution_id          Nullable(String),
    activity_id           Nullable(String),
    incident_type         String,
    incident_message      Nullable(String),
    cause_incident_id     Nullable(String),
    root_cause_incident_id Nullable(String),
    configuration         Nullable(String),
    create_time           DateTime64(3),
    end_time              Nullable(DateTime64(3)),
    state                 String,
    tenant_id             Nullable(String),
    engine_type           String,
    event_type            String,
    trace_id              Nullable(String),
    timestamp             DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(timestamp)
ORDER BY (process_definition_key, create_time, id)
PARTITION BY toYYYYMM(create_time)
