import type { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerFailureTools(register: Register) {
  register({
    name: "analytics_find_failed_instances",
    category: "analytics",
    description:
      "List currently-open incident patterns from process metrics, grouped by incident type and process definition (point-in-time — what is failing right now). For the actual failed instances (ids, messages), drill in with camunda7_list_incidents / camunda7_query_historic_process_instances.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.findFailedInstancesInput.shape,
    handler: async (ch, args) =>
      queries.findFailedInstances(ch, args as z.infer<typeof schemas.findFailedInstancesInput>),
  })
}
