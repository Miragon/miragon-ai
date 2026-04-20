import { z } from "zod"

export const pathFrequencyInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to analyze"),
  period: z.enum(["1d", "7d", "30d", "90d"]).default("7d").describe("Analysis time period"),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe(
      "Minimum number of instances per path before it is returned. Prevents leakage of rare/individual executions.",
    ),
  limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of paths to return"),
})

export const elementBottleneckInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to analyze"),
  period: z.enum(["1d", "7d", "30d", "90d"]).default("7d").describe("Analysis time period"),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe("Minimum number of executions per activity before it is returned."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of activities to return"),
})
