import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { schemas, queries } from "@miragon-ai/analytics-client"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ProfileSource } from "../server-locale.js"
import { optionalMinBucketSize, optionalPeriod, settingsFor } from "../settings.js"
import { withEngineScope, type AnalyticsEngineScope } from "../engine-ids.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerElementTools(
  register: Register,
  engineScope: AnalyticsEngineScope,
  profileStore?: ProfileSource,
) {
  register({
    name: "analytics_element_bottleneck",
    category: "analytics",
    description:
      "Rank activities by execution-time contribution and incident rate over a rolling window, from process metrics. Activities with fewer than `minBucketSize` executions are suppressed. Note: queue/wait time is not available from metrics.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      ...schemas.elementBottleneckInput.shape,
      period: optionalPeriod,
      minBucketSize: optionalMinBucketSize,
    },
    handler: async (ch, args, ctx) => {
      const settings = await settingsFor(profileStore, ctx)
      return queries.elementBottleneck(ch, {
        ...withEngineScope(engineScope, args),
        period: args.period ?? settings.defaultPeriod,
        minBucketSize: args.minBucketSize ?? settings.minBucketSize,
      })
    },
  })
}
