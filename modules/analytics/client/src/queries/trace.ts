import { escapeString, type ClickHouseClient } from "../clickhouse.js"

export interface ActivityHistoryItem {
  activity_id: string
  activity_name: string | null
  activity_type: string
  start_time: string
  end_time: string | null
  duration_in_millis: number | null
  assignee: string | null
  task_id: string | null
}

export interface VariableChangeItem {
  variable_name: string
  variable_type: string
  text_value: string | null
  long_value: number | null
  double_value: number | null
  revision: number
  timestamp: string
}

export interface OtelSpanItem {
  TraceId: string
  SpanName: string
  ServiceName: string
  duration_ms: number
  StatusCode: string
  StatusMessage: string
}

export interface TraceResult {
  activityHistory?: ActivityHistoryItem[]
  variableChanges?: VariableChangeItem[]
  otelSpans?: OtelSpanItem[]
  otelSpansError?: string
}

export async function traceProcessExecution(
  ch: ClickHouseClient,
  params: {
    processInstanceId: string
    includeOtelSpans: boolean
    includeActivityHistory: boolean
    includeVariableChanges: boolean
  },
): Promise<TraceResult> {
  const pid = escapeString(params.processInstanceId)
  const result: TraceResult = {}

  if (params.includeActivityHistory) {
    const actSql = `
SELECT
    activity_id,
    activity_name,
    activity_type,
    start_time,
    end_time,
    duration_in_millis,
    assignee,
    task_id
FROM camunda_history.camunda_activity_instances
WHERE process_instance_id = ${pid}
ORDER BY start_time ASC`
    result.activityHistory = await ch.query<ActivityHistoryItem>(actSql)
  }

  if (params.includeVariableChanges) {
    const varSql = `
SELECT
    variable_name,
    variable_type,
    text_value,
    long_value,
    double_value,
    revision,
    timestamp
FROM camunda_history.camunda_variable_updates FINAL
WHERE process_instance_id = ${pid}
ORDER BY timestamp ASC`
    result.variableChanges = await ch.query<VariableChangeItem>(varSql)
  }

  if (params.includeOtelSpans) {
    const otelSql = `
SELECT
    t.TraceId,
    t.SpanName,
    t.ServiceName,
    t.Duration / 1000000 AS duration_ms,
    t.StatusCode,
    t.StatusMessage
FROM otel.otel_traces t
JOIN camunda_history.camunda_process_instances p ON t.TraceId = p.trace_id
WHERE p.id = ${pid}
ORDER BY t.Timestamp`
    try {
      result.otelSpans = await ch.query<OtelSpanItem>(otelSql)
    } catch {
      result.otelSpans = []
      result.otelSpansError = "OTEL traces not available (otel database may not exist)"
    }
  }

  return result
}
