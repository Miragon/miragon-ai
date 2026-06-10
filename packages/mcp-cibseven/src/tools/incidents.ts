import { listIncidentsInput, resolveIncidentInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getIncidents,
  getIncidentsCount,
  resolveIncident,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerIncidentTools(register: Register) {
  register({
    name: "camunda7_list_incidents",
    description:
      "List incidents (errors) in the engine: failed jobs, external task failures, etc. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listIncidentsInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processInstanceId: args.processInstanceId,
        processDefinitionId: args.processDefinitionId,
        incidentType: args.incidentType,
      }
      const [items, count] = await Promise.all([
        getIncidents({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
          },
        }),
        getIncidentsCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
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
