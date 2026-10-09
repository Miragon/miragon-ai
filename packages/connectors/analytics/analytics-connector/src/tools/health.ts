import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { ENGINE_HEALTH_STATUS_RULE, schemas, queries } from "@miragon-ai/analytics-client"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { AnalyticsEngineScope } from "../engine-ids.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerHealthTools(register: Register, engineScope: AnalyticsEngineScope) {
  register({
    name: "analytics_engine_health",
    category: "analytics",
    description:
      "Live operational health of the CIB Seven engine(s), from Prometheus state gauges: running WIP, open incidents by type, dead jobs (retries exhausted), executable/suspended job backlog, open/unassigned user tasks, external-task backlog, deployed definitions, and which alert rules are firing/pending. " +
      "Names the engines judged and the silent ones (`silentEngines`: their counts read 0 because nothing arrives). " +
      `Status: ${ENGINE_HEALTH_STATUS_RULE} ` +
      "Use for fleet-wide or metric-based health; for one engine's live incident clusters use camunda7_show_engine_health.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.engineHealthInput.shape,
    handler: async (ch, args) => {
      const engines = engineScope.resolve(args.engine)
      // The module's engine-less alerts (a collector outage) only count for a
      // verdict over the whole configured fleet.
      return queries.engineHealth(ch, {
        engine: engines,
        includeFleetAlerts: engineScope.coversFleet(engines),
      })
    },
  })
}
