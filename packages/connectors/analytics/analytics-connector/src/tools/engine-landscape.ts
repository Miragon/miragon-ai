import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { schemas, queries } from "@miragon-ai/analytics-client"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerEngineLandscapeTools(register: Register) {
  register({
    name: "analytics_engine_landscape",
    category: "analytics",
    description:
      "Cross-engine overview of the process landscape: which process definitions run on which engine (the inventory matrix), the absolute load per engine (running instances, open incidents, failed jobs), and the engine-owned job backlog (executable/suspended/future-due jobs, open external tasks). Reports counts, not rates, on purpose — engines host different process mixes, so a per-engine failure rate or average duration measures the mix rather than the engine. The backlog gauges carry no process label and therefore DO compare across engines. Returns `sharedProcessKeys`: the definitions deployed on more than one engine, the only sound inputs for analytics_engine_compare. Pass the full configured engine list to also surface engines reporting no metrics at all (`reporting: false`).",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.engineLandscapeInput.shape,
    handler: async (ch, args) => queries.engineLandscape(ch, args),
  })
}
