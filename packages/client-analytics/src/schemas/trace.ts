import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const traceProcessExecutionInput = z.object({
  processInstanceId: z.string().describe("Process instance ID to trace"),
  includeOtelSpans: z
    .boolean()
    .default(true)
    .describe("Include OTEL trace spans (requires otel database)"),
  includeActivityHistory: z.boolean().default(true).describe("Include activity instance history"),
  includeVariableChanges: z.boolean().default(false).describe("Include variable change history"),
  ...engineFilterShape,
})
