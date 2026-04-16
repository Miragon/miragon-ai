import type { ClickHouseClient } from "@automation-mcp/client-analytics"
import { schemas, queries } from "@automation-mcp/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerFailureTools(register: Register) {
  register({
    name: "analytics_find_failed_instances",
    description:
      "Find failed process instances with incident details and error patterns. Optionally group by error message to identify common failure patterns.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.findFailedInstancesInput.shape,
    handler: async (ch, args) => queries.findFailedInstances(ch, args),
  })
}
