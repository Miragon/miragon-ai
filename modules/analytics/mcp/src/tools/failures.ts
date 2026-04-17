import type { z } from "zod"
import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerFailureTools(register: Register) {
  register({
    name: "analytics_find_failed_instances",
    description:
      "Find failed process instances with incident details and error patterns. Optionally group by error message to identify common failure patterns.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.findFailedInstancesInput.shape,
    handler: async (ch, args) =>
      queries.findFailedInstances(ch, args as z.infer<typeof schemas.findFailedInstancesInput>),
  })
}
