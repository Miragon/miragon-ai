import type { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerHealthTools(register: Register) {
  register({
    name: "analytics_engine_health",
    description:
      "Live operational health of the CIB Seven engine(s), from Prometheus state gauges: running WIP, open incidents by type, dead jobs (retries exhausted), executable/suspended job backlog, open/unassigned user tasks, external-task backlog, deployed definitions, and which alert rules are firing/pending. A one-call ops snapshot with an overall status (healthy/degraded/critical). Optional engineId filter.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.engineHealthInput.shape,
    handler: async (ch, args) =>
      queries.engineHealth(ch, args as z.infer<typeof schemas.engineHealthInput>),
  })
}
