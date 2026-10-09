import { z } from "zod"
import { engineDateParam, firstResultParam, maxResultsParam, sortOrderParam } from "./shared.js"

export const listIncidentsInput = z.object({
  processInstanceId: z.string().optional().describe("Filter by process instance ID"),
  processDefinitionKey: z
    .string()
    .optional()
    .describe("Filter by process definition key (all versions)"),
  processDefinitionKeyIn: z
    .array(z.string())
    .optional()
    .describe("Filter by any of these process definition keys"),
  processDefinitionId: z
    .string()
    .optional()
    .describe("Filter by process definition ID (one version)"),
  activityId: z.string().optional().describe("Filter by the activity the incident occurred at"),
  incidentType: z
    .string()
    .optional()
    .describe("Filter by incident type (e.g. failedJob, failedExternalTask)"),
  incidentTimestampAfter: engineDateParam("Raised after"),
  incidentTimestampBefore: engineDateParam("Raised before"),
  firstResult: firstResultParam,
  maxResults: maxResultsParam(),
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
  sortOrder: sortOrderParam,
})

export const resolveIncidentInput = z.object({
  incidentId: z.string().describe("The incident ID to resolve"),
})

export const formatIncidentIssueInput = z.object({
  incidentId: z.string().describe("The incident ID to draft a ticket for"),
})
