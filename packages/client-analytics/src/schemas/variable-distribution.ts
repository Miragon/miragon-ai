import { z } from "zod"

export const variableDistributionInput = z.object({
  variableName: z.string().min(1).describe("Process variable name to analyze"),
  processDefinitionKey: z
    .string()
    .optional()
    .describe("Restrict to one process definition (optional)"),
  period: z.enum(["1d", "7d", "30d", "90d"]).default("7d").describe("Analysis time period"),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Suppress buckets with fewer observations than this (privacy/PII hygiene)"),
  numericBuckets: z
    .number()
    .int()
    .min(2)
    .max(50)
    .default(10)
    .describe("Target bucket count for numeric distributions (histogram)"),
  topK: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Top-K values for string distributions"),
})
