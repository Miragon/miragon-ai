import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { escapeString, type ClickHouseClient } from "../client.js"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerTraceTools(register: Register) {
  register({
    name: "analytics_trace_process_execution",
    description:
      "Combine OTEL traces with process history for end-to-end execution visibility of a specific process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      processInstanceId: z.string().describe("Process instance ID to trace"),
      includeOtelSpans: z
        .boolean()
        .default(true)
        .describe("Include OTEL trace spans (requires otel database)"),
      includeActivityHistory: z
        .boolean()
        .default(true)
        .describe("Include activity instance history"),
      includeVariableChanges: z
        .boolean()
        .default(false)
        .describe("Include variable change history"),
    },
    handler: async (ch, args) => {
      const pid = escapeString(args.processInstanceId)
      const result: Record<string, unknown> = {}

      if (args.includeActivityHistory) {
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
        result.activityHistory = await ch.query(actSql)
      }

      if (args.includeVariableChanges) {
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
        result.variableChanges = await ch.query(varSql)
      }

      if (args.includeOtelSpans) {
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
          result.otelSpans = await ch.query(otelSql)
        } catch {
          result.otelSpans = []
          result.otelSpansError = "OTEL traces not available (otel database may not exist)"
        }
      }

      return result
    },
  })
}
