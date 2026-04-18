import type { z } from "zod"
import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerPathTools(register: Register) {
  register({
    name: "analytics_path_frequency",
    description:
      "Aggregate the most frequent activity paths (sequences) through a process definition. Returns paths and Sankey-ready edges; paths seen fewer than `minBucketSize` times are suppressed so individual executions cannot be inferred.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.pathFrequencyInput.shape,
    handler: async (ch, args) =>
      queries.pathFrequency(ch, args as z.infer<typeof schemas.pathFrequencyInput>),
  })

  register({
    name: "analytics_element_bottleneck",
    description:
      "Rank activities by total time contribution (execution time + queue wait) and incident rate. Activities with fewer than `minBucketSize` executions are suppressed.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.elementBottleneckInput.shape,
    handler: async (ch, args) =>
      queries.elementBottleneck(ch, args as z.infer<typeof schemas.elementBottleneckInput>),
  })
}
