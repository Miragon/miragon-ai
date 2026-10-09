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
      "Compare KPIs between two deployed process definition versions of the same processDefinitionKey over a shared rolling window, from metrics. The version is an exact label on the process-instance series, so instance counts, completed counts and durations (avg, p95) per version plus their deltas are precise. failed_count, failure_rate_pct, incident_count, incident_rate_pct and their deltas are null — NOT zero: the incident metric carries no version label, so incidents cannot be split by version (see `notes`); for incident figures per process key (all versions together) use analytics_analyze_process_performance or analytics_element_bottleneck. Flagged `suppressed` when either version has fewer than minBucketSize instances. Pair with camunda7_list_process_definitions to discover versions.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...schemas.versionCompareInput.shape, minBucketSize: optionalMinBucketSize },
    handler: async (ch, args, ctx) =>
      queries.versionCompare(ch, {
        ...args,
        minBucketSize: args.minBucketSize ?? (await settingsFor(profileStore, ctx)).minBucketSize,
      }),
  })
}
