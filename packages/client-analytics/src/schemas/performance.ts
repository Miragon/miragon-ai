import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const analyzePerformanceInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to analyze"),
  period: z.enum(["1d", "7d", "30d", "90d"]).default("7d").describe("Analysis time period"),
  includeActivityBreakdown: z
    .boolean()
    .default(true)
    .describe("Include per-activity bottleneck analysis"),
  ...engineFilterShape,
})

export const comparePeriodsInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to compare"),
  periodAFrom: z.string().describe("Period A start (ISO datetime)"),
  periodATo: z.string().describe("Period A end (ISO datetime)"),
  periodBFrom: z.string().describe("Period B start (ISO datetime)"),
  periodBTo: z.string().describe("Period B end (ISO datetime)"),
  includeActivityBreakdown: z.boolean().default(false).describe("Include per-activity comparison"),
  ...engineFilterShape,
})
