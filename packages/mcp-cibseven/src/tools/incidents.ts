import type { Client } from "@miragon-ai/client-cibseven"
import { listIncidentsInput, resolveIncidentInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getIncidents, resolveIncident } from "@miragon-ai/client-cibseven/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerIncidentTools(register: Register) {
  register({
    name: "camunda7_list_incidents",
    description:
      "List incidents (errors) in the engine. Shows failed jobs, external task failures, etc.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listIncidentsInput.shape,
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
    inputSchema: resolveIncidentInput.shape,
    handler: async (client, args) => {
      await resolveIncident({ client, path: { id: args.incidentId } })
      return { success: true, incidentId: args.incidentId }
    },
  })
}
