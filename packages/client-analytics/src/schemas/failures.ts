import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const findFailedInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  period: z.enum(["1d", "7d", "30d"]).default("7d").describe("Time period to search"),
  incidentType: z.string().optional().describe("Filter by incident type (e.g. failedJob)"),
  groupByError: z
    .boolean()
    .default(false)
    .describe("Group results by error message to show patterns"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
  ...engineFilterShape,
})
