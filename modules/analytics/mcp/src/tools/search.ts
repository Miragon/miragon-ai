import type { z } from "zod"
import type { ClickHouseClient } from "@automation-mcp/client-analytics"
import { schemas, queries } from "@automation-mcp/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerSearchTools(register: Register) {
  register({
    name: "analytics_search_process_instances",
    description:
      "Search historic process instances using flexible criteria via ClickHouse. Supports filtering by key, state, time range, duration, incidents, and variables.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.searchProcessInstancesInput.shape,
    handler: async (ch, args) =>
      queries.searchProcessInstances(
        ch,
        args as z.infer<typeof schemas.searchProcessInstancesInput>,
      ),
  })

  register({
    name: "analytics_search_by_variable",
    description:
      "Search process instances by variable name and value. Useful for finding instances by business identifiers like orderId, customerId, etc.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.searchByVariableInput.shape,
    handler: async (ch, args) =>
      queries.searchByVariable(ch, args as z.infer<typeof schemas.searchByVariableInput>),
  })
}
