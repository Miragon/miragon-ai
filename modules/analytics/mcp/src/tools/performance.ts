import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerPerformanceTools(register: Register) {
  register({
    name: "analytics_analyze_process_performance",
    description:
      "Analyze process performance: throughput, P95 duration, failure rate, and bottleneck activities.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.analyzePerformanceInput.shape,
    handler: async (ch, args) => queries.analyzePerformance(ch, args),
  })

  register({
    name: "analytics_compare_execution_periods",
    description:
      "Compare process execution metrics between two time periods. Useful for before/after deployment comparisons or regression analysis.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.comparePeriodsInput.shape,
    handler: async (ch, args) => queries.comparePeriods(ch, args),
  })
}
