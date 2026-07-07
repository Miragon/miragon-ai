import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerEngineCompareTools(register: Register) {
  register({
    name: "analytics_engine_compare",
    category: "analytics",
    description:
      'Compare KPIs across two CIB Seven engines over a shared rolling window, from metrics. The engine is an exact metric label (engine_id) and all engines feed one Prometheus, so the partition is precise — the fleet/cluster comparison (e.g. prod-a vs prod-b) the metric path is built for. Returns instance counts, completion/failure ratios, durations (avg, p95) and incident rate per engine, plus a delta. Optionally scope to one processDefinitionKey. Flagged `suppressed` when either engine has fewer than minBucketSize instances. Discover engine ids with the camunda7_engine tool (action "list").',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.engineCompareInput.shape,
    handler: async (ch, args) => queries.engineCompare(ch, args),
  })
}
