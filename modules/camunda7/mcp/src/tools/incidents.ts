import { z } from "zod"
import type { Client } from "@automation-mcp/client-camunda7"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getIncidents,
  resolveIncident,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerIncidentTools(register: Register) {
  register({
    name: "camunda7_list_incidents",
    description:
      "List incidents (errors) in the engine. Shows failed jobs, external task failures, etc.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
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
    },
    handler: async (client, args) =>
      getIncidents({
        client,
        query: {
          processInstanceId: args.processInstanceId,
          processDefinitionId: args.processDefinitionId,
          incidentType: args.incidentType,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_resolve_incident",
    description: "Resolve an incident by ID.",
    annotations: { openWorldHint: true },
    inputSchema: { incidentId: z.string().describe("The incident ID to resolve") },
    handler: async (client, args) => {
      await resolveIncident({ client, path: { id: args.incidentId } })
      return { success: true, incidentId: args.incidentId }
    },
  })
}
