import { z } from "zod"

export const variableSchema = z
  .record(
    z.string(),
    z.object({
      value: z.unknown().describe("Variable value"),
      type: z.string().optional().describe("Variable type (String, Integer, Boolean, etc.)"),
    }),
  )
  .describe("Process variables map")
