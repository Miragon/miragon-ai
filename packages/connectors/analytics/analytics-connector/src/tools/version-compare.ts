import type { PrometheusClient } from "@miragon-ai/analytics-client"
import { schemas, queries } from "@miragon-ai/analytics-client"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ProfileSource } from "../server-locale.js"
import { optionalMinBucketSize, settingsFor } from "../settings.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerVersionCompareTools(register: Register, profileStore?: ProfileSource) {
  register({
    name: "analytics_version_compare",
    category: "analytics",
    description:
      "Compare KPIs and per-element incident rate between two deployed process definition versions of the same processDefinitionKey over a shared rolling window, from metrics. Versions are an exact metric label, so the partition is precise. Returns instance counts, completion/failure ratios, durations (avg, p95), and incident rate per version, plus a delta. Flagged `suppressed` when either version has fewer than minBucketSize instances. Pair with camunda7_list_process_definitions to discover versions.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...schemas.versionCompareInput.shape, minBucketSize: optionalMinBucketSize },
    handler: async (ch, args) =>
      queries.versionCompare(ch, {
        ...args,
        minBucketSize: args.minBucketSize ?? (await settingsFor(profileStore)).minBucketSize,
      }),
  })
}
