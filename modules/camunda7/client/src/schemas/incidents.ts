import { z } from "zod"

export const listIncidentsInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionId: z.string().optional().describe("Filter by process definition ID"),
  incidentType: z
    .string()
    .optional()
    .describe("Filter by incident type (e.g. failedJob, failedExternalTask)"),
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z
    .enum([
      "incidentId",
      "incidentMessage",
      "incidentTimestamp",
      "incidentType",
      "executionId",
      "activityId",
      "processInstanceId",
      "processDefinitionId",
      "causeIncidentId",
      "rootCauseIncidentId",
      "configuration",
      "tenantId",
    ])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const resolveIncidentInput = z.object({
  incidentId: z.string().describe("The incident ID to resolve"),
})
