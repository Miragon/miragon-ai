import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { schemas, queries } from "@miragon-ai/analytics-client"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ProfileSource } from "../server-locale.js"
import { optionalPeriod, settingsFor } from "../settings.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerPerformanceTools(register: Register, profileStore?: ProfileSource) {
  register({
    name: "analytics_analyze_process_performance",
    category: "analytics",
    description:
      "Analyze process performance from metrics: throughput, P50/P95 duration, incident-based failure rate, and per-activity breakdown over a rolling window.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...schemas.analyzePerformanceInput.shape, period: optionalPeriod },
    handler: async (ch, args) =>
      queries.analyzePerformance(ch, {
        ...args,
        period: args.period ?? (await settingsFor(profileStore)).defaultPeriod,
      }),
  })

  register({
    name: "analytics_compare_execution_periods",
    category: "analytics",
    description:
      "Compare process execution metrics between two time periods (before/after deployment, regression analysis). Uses PromQL historical windows — both periods must fall within Prometheus retention.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.comparePeriodsInput.shape,
    handler: async (ch, args) => queries.comparePeriods(ch, args),
  })
}
