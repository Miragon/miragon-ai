import type { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerPerformanceTools(register: Register) {
  register({
    name: "analytics_analyze_process_performance",
    category: "analytics",
    description:
      "Analyze process performance from metrics: throughput, P50/P95 duration, incident-based failure rate, and per-activity breakdown over a rolling window.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.analyzePerformanceInput.shape,
    handler: async (ch, args) =>
      queries.analyzePerformance(ch, args as z.infer<typeof schemas.analyzePerformanceInput>),
  })

  register({
    name: "analytics_compare_execution_periods",
    category: "analytics",
    description:
      "Compare process execution metrics between two time periods (before/after deployment, regression analysis). Uses PromQL historical windows — both periods must fall within Prometheus retention.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.comparePeriodsInput.shape,
    handler: async (ch, args) =>
      queries.comparePeriods(ch, args as z.infer<typeof schemas.comparePeriodsInput>),
  })
}
