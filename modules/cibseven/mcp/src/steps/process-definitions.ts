import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client } from "@miragon-ai/client-cibseven"
import { getProcessDefinitions } from "@miragon-ai/client-cibseven/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

/**
 * Loads the list of deployed process definitions. Widgets like
 * `camunda7:process-list` read the result from `camunda7:definitions`.
 */
export const loadProcessDefinitionsStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-process-definitions",
  dataType: "camunda7:processDefinitionList",
  requires: [],
  produces: ["camunda7:definitions"],
  execute: async (context, appConfig) => {
    const client = appConfig.client
    const filterKey = context.keys["camunda7:processDefinitionKey"] as string | undefined
    const nameLike = context.keys["camunda7:nameLike"] as string | undefined

    const definitions = await getProcessDefinitions({
      client,
      query: {
        key: filterKey,
        nameLike,
        latestVersion: true,
        maxResults: 100,
        sortBy: "name",
        sortOrder: "asc",
      },
    })

    const list = Array.isArray(definitions) ? definitions : []
    return {
      data: { definitions: list, totalCount: list.length },
      keys: {
        "camunda7:definitions": list,
      },
      _app: "camunda7",
      _step: "load-process-definitions",
    }
  },
}
