import { z } from "zod"

export const engineCompareInput = z.object({
  engineA: z
    .string()
    .min(1)
    .describe("First engine id (the baseline). Discover ids with camunda7_list_engines."),
  engineB: z.string().min(1).describe("Second engine id (the comparison)."),
  windowDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(14)
    .describe("Look-back window applied to both engines, in days (max 30 — Prometheus retention)."),
  processDefinitionKey: z
    .string()
    .optional()
    .describe(
      "Restrict to a single process definition (optional; otherwise compares all processes on each engine).",
    ),
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
