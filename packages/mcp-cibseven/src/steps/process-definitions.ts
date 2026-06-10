import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { getProcessDefinitions } from "@miragon-ai/client-cibseven/sdk"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads the list of deployed process definitions. Widgets like
 * `camunda7:process-list` read the result from `camunda7:definitions`.
 */
export const loadProcessDefinitionsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-definitions",
  dataType: "camunda7:processDefinitionList",
  requires: [],
  produces: ["camunda7:definitions"],
  execute: async (context, appConfig) => {
    const { client } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
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
