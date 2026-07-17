import { z } from "zod"
import { engineFilterShape, periodField } from "./shared.js"

export const elementBottleneckInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to analyze"),
  period: periodField,
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
  ...engineFilterShape,
})
