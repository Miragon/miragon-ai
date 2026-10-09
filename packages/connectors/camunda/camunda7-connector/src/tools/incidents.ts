import { listIncidentsInput, resolveIncidentInput } from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { engineKeyList, engineSorting, toOptionalEngineDate } from "@miragon-ai/camunda7-client"
import { getIncidents, getIncidentsCount, resolveIncident } from "@miragon-ai/camunda7-client/sdk"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerIncidentTools(register: Register) {
  register({
    name: "camunda7_list_incidents",
    category: "incidents",
    description:
      "List incidents (errors) in the engine: failed jobs, external task failures, etc. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listIncidentsInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      const filters = {
        processInstanceId: args.processInstanceId,
        // The engine filters incidents by key only as a comma list.
        processDefinitionKeyIn: engineKeyList(
          args.processDefinitionKey,
          args.processDefinitionKeyIn,
        ),
        processDefinitionId: args.processDefinitionId,
        activityId: args.activityId,
        incidentType: args.incidentType,
        incidentTimestampAfter: toOptionalEngineDate(args.incidentTimestampAfter),
        incidentTimestampBefore: toOptionalEngineDate(args.incidentTimestampBefore),
      }
      const [items, count] = await Promise.all([
        getIncidents({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            ...engineSorting(args),
          },
        }),
        getIncidentsCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })

  register({
    name: "camunda7_resolve_incident",
    category: "incidents",
    description:
      "Resolve a custom incident by ID. The engine refuses failedJob/failedExternalTask (400) — retry those: " +
      "camunda7_set_job_retries / camunda7_set_external_task_retries on the incident's configuration id.",
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: { ...resolveIncidentInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await resolveIncident({ client, path: { id: args.incidentId } })
      return { success: true, incidentId: args.incidentId }
    }),
  })
}
