import type { z } from "zod"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerElementTools(register: Register) {
  register({
    name: "analytics_element_bottleneck",
    category: "analytics",
    description:
      "Rank activities by execution-time contribution and incident rate over a rolling window, from process metrics. Activities with fewer than `minBucketSize` executions are suppressed. Note: queue/wait time is not available from metrics.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: schemas.elementBottleneckInput.shape,
    handler: async (ch, args) =>
      queries.elementBottleneck(ch, args as z.infer<typeof schemas.elementBottleneckInput>),
  })
}
