import type { ClickHouseClient } from "@automation-mcp/client-analytics"
import { schemas, queries } from "@automation-mcp/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerTraceTools(register: Register) {
  register({
    name: "analytics_trace_process_execution",
    description:
      "Combine OTEL traces with process history for end-to-end execution visibility of a specific process instance.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.traceProcessExecutionInput.shape,
    handler: async (ch, args) => queries.traceProcessExecution(ch, args),
  })
}
