import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ProfileSource } from "../server-locale.js"
import { optionalMinBucketSize, settingsFor } from "../settings.js"

type Register = ReturnType<typeof createToolRegistrar<PrometheusClient>>

export function registerEngineCompareTools(register: Register, profileStore?: ProfileSource) {
  register({
    name: "analytics_engine_compare",
    category: "analytics",
    description:
      'Compare ONE process definition as it runs on two CIB Seven engines (e.g. prod-a vs prod-b) over a shared rolling window, from metrics. processDefinitionKey is required: engines host different process mixes, so comparing their whole workloads would measure the mix rather than the engines — holding the process fixed is what makes the delta attributable. Returns instance counts, completion/failure ratios, durations (avg, p95) and incident rate per engine, plus a delta. Flagged `suppressed` when either engine has fewer than minBucketSize instances. For the unscoped cross-engine picture (what runs where, load, job backlog, which keys are deployed on several engines) use analytics_engine_landscape first; its `sharedProcessKeys` are the valid inputs here. Discover engine ids with the camunda7_engine tool (action "list").',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...schemas.engineCompareInput.shape, minBucketSize: optionalMinBucketSize },
    handler: async (ch, args) =>
      queries.engineCompare(ch, {
        ...args,
        minBucketSize: args.minBucketSize ?? (await settingsFor(profileStore)).minBucketSize,
      }),
  })
}
