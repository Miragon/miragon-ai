import type { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerFailureTools(register: Register) {
  register({
    name: "analytics_find_failed_instances",
    description:
      "Aggregate incident/failure patterns from metrics, grouped by incident type, activity, and process definition over a rolling window. For the actual failed instances (ids, messages), drill in with camunda7_list_incidents / camunda7_query_historic_process_instances.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.findFailedInstancesInput.shape,
    handler: async (ch, args) =>
      queries.findFailedInstances(ch, args as z.infer<typeof schemas.findFailedInstancesInput>),
  })
}
