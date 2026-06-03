import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const findFailedInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  incidentType: z.string().optional().describe("Filter by incident type (e.g. failedJob)"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
  ...engineFilterShape,
})
