// Placeholder row types for ClickHouse analytics (Phase 3+)

export interface ClickHouseProcessInstanceRow {
  process_instance_id: string;
  process_definition_id: string;
  process_definition_key: string;
  business_key: string | null;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  state: string;
  start_user_id: string | null;
  tenant_id: string | null;
  engine_type: string;
}

export interface ClickHouseActivityInstanceRow {
  activity_instance_id: string;
  activity_id: string;
  activity_name: string | null;
  activity_type: string;
  process_instance_id: string;
  process_definition_id: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  assignee: string | null;
  tenant_id: string | null;
  engine_type: string;
}

export interface ClickHouseTaskInstanceRow {
  task_id: string;
  process_instance_id: string;
  process_definition_key: string;
  task_definition_key: string;
  name: string | null;
  assignee: string | null;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  tenant_id: string | null;
  engine_type: string;
}

export interface ClickHouseVariableUpdateRow {
  variable_id: string;
  variable_name: string;
  variable_type: string;
  process_instance_id: string;
  execution_id: string;
  task_id: string | null;
  value_text: string | null;
  value_double: number | null;
  value_long: number | null;
  timestamp: string;
  tenant_id: string | null;
  engine_type: string;
}

export interface ClickHouseIncidentRow {
  incident_id: string;
  incident_type: string;
  incident_message: string | null;
  process_instance_id: string;
  process_definition_id: string;
  activity_id: string;
  timestamp: string;
  resolved_timestamp: string | null;
  tenant_id: string | null;
  engine_type: string;
}
