import type { z } from "zod"
import type { ClickHouseClient } from "@automation-mcp/client-analytics"
import { schemas, queries } from "@automation-mcp/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerPerformanceTools(register: Register) {
  register({
    name: "analytics_analyze_process_performance",
    description:
      "Analyze process performance: throughput, P95 duration, failure rate, and bottleneck activities.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.analyzePerformanceInput.shape,
    handler: async (ch, args) =>
      queries.analyzePerformance(ch, args as z.infer<typeof schemas.analyzePerformanceInput>),
  })

  register({
    name: "analytics_compare_execution_periods",
    description:
      "Compare process execution metrics between two time periods. Useful for before/after deployment comparisons or regression analysis.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.comparePeriodsInput.shape,
    handler: async (ch, args) =>
      queries.comparePeriods(ch, args as z.infer<typeof schemas.comparePeriodsInput>),
  })
}
