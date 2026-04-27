import type { z } from "zod"
import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { schemas, queries } from "@miragon-ai/client-analytics"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerVersionCompareTools(register: Register) {
  register({
    name: "analytics_version_compare",
    description:
      "Compare KPIs and per-element incident rate between two deployed process definition versions of the same processDefinitionKey, using a shared time window. Returns instance counts, completion/failure ratios, durations (avg, p95), and incident rate per version, plus a delta. Results are flagged `suppressed` when either version has fewer than minBucketSize instances. Pair with camunda7_list_process_definitions to discover available versions.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: schemas.versionCompareInput.shape,
    handler: async (ch, args) =>
      queries.versionCompare(ch, args as z.infer<typeof schemas.versionCompareInput>),
  })
}
