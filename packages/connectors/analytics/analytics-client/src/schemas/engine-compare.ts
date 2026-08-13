import { z } from "zod"

export const engineCompareInput = z.object({
  processDefinitionKey: z
    .string()
    .min(1)
    .describe(
      "The process definition key to compare on both engines — REQUIRED. Engines run different process mixes, so comparing their whole workloads measures the mix, not the engines; scoping to ONE process is what makes the delta attributable. Discover keys deployed on several engines with analytics_engine_landscape (field `sharedProcessKeys`).",
    ),
  engineA: z
    .string()
    .min(1)
    .describe(
      'First engine id (the baseline). Discover ids with the camunda7_engine tool (action "list").',
    ),
  engineB: z.string().min(1).describe("Second engine id (the comparison)."),
  windowDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(14)
    .describe("Look-back window applied to both engines, in days (max 30 — Prometheus retention)."),
  elementId: z
    .string()
    .optional()
    .describe("Restrict incident count to a single BPMN element (optional)."),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Minimum instance count per engine before results are trusted."),
})
