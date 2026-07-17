import { z } from "zod"
import { engineFilterShape, isoDatetimeString, periodField } from "./shared.js"

export const analyzePerformanceInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to analyze"),
  period: periodField,
  includeActivityBreakdown: z
    .boolean()
    .default(true)
    .describe("Include per-activity bottleneck analysis"),
  ...engineFilterShape,
})

export const comparePeriodsInput = z.object({
  processDefinitionKey: z.string().describe("Process definition key to compare"),
  periodAFrom: isoDatetimeString.describe("Period A start (ISO datetime)"),
  periodATo: isoDatetimeString.describe("Period A end (ISO datetime)"),
  periodBFrom: isoDatetimeString.describe("Period B start (ISO datetime)"),
  periodBTo: isoDatetimeString.describe("Period B end (ISO datetime)"),
  includeActivityBreakdown: z.boolean().default(false).describe("Include per-activity comparison"),
  ...engineFilterShape,
})
