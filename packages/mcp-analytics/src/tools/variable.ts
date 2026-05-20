import type { z } from "zod"
import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerVariableTools(register: Register) {
  register({
    name: "analytics_variable_distribution",
    description:
      "Distribution of a process variable's final value per instance over a time window. Buckets smaller than minBucketSize are suppressed (privacy/PII hygiene). Numeric variables are histogrammed, strings are top-K, booleans are grouped.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.variableDistributionInput.shape,
    handler: async (ch, args) =>
      queries.variableDistribution(ch, args as z.infer<typeof schemas.variableDistributionInput>),
  })
}
