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

/**
 * Shared pagination offset for every list/query input schema. Pairs with
 * `maxResults`: a list tool returns the page `[firstResult, firstResult +
 * maxResults)` plus a total count, so callers page through by passing the
 * `nextOffset` from the previous response.
 */
export const firstResultParam = z
  .number()
  .int()
  .min(0)
  .optional()
  .default(0)
  .describe("Zero-based index of the first result to return (pagination offset)")
