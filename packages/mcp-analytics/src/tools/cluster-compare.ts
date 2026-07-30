import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ProfileSource } from "../server-locale.js"
import { optionalMinBucketSize, settingsFor } from "../settings.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerClusterCompareTools(register: Register, profileStore?: ProfileSource) {
  register({
    name: "analytics_cluster_compare",
    category: "analytics",
    description:
      "Pre/Post deployment correlation from metrics. Given a deployment timestamp and windows before/after, compute instance KPIs + per-element incident rate and the delta, using PromQL historical windows. Results are flagged `suppressed` if either window has fewer than minBucketSize instances. Typical flow: commit-hash → camunda7_get_deployment → deployment.timestamp → this tool.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...schemas.clusterCompareInput.shape, minBucketSize: optionalMinBucketSize },
    handler: async (ch, args) =>
      queries.clusterCompare(ch, {
        ...args,
        minBucketSize: args.minBucketSize ?? (await settingsFor(profileStore)).minBucketSize,
      }),
  })
}
