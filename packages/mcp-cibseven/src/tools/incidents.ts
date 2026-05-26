import { listIncidentsInput, resolveIncidentInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getIncidents, resolveIncident } from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerIncidentTools(register: Register) {
  register({
    name: "camunda7_list_incidents",
    description:
      "List incidents (errors) in the engine. Shows failed jobs, external task failures, etc.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listIncidentsInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
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
    ),
  })

  register({
    name: "camunda7_resolve_incident",
    description: "Resolve an incident by ID.",
    annotations: { openWorldHint: true },
    inputSchema: { ...resolveIncidentInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await resolveIncident({ client, path: { id: args.incidentId } })
      return { success: true, incidentId: args.incidentId }
    }),
  })
}
