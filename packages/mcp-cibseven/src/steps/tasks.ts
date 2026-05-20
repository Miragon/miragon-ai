import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client } from "@miragon-ai/client-cibseven"
import { getTasks } from "@miragon-ai/client-cibseven/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

export const loadTasksStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-tasks",
  dataType: "camunda7:taskList",
  requires: [],
  produces: ["camunda7:tasks", "camunda7:taskFilters"],
  execute: async (context, appConfig) => {
    const client = appConfig.client
    const assignee = context.keys["camunda7:assignee"] as string | undefined
    const candidateGroup = context.keys["camunda7:candidateGroup"] as string | undefined
    const processDefinitionKey = context.keys["camunda7:processDefinitionKey"] as string | undefined

    const tasks = await getTasks({
      client,
      query: {
        assignee,
        candidateGroup,
        processDefinitionKey,
        maxResults: 50,
        sortBy: "created",
        sortOrder: "desc",
      },
    })

    const list = Array.isArray(tasks) ? tasks : []
    const filters = { assignee, candidateGroup, processDefinitionKey }
    return {
      data: { tasks: list, totalCount: list.length, filters },
      keys: {
        "camunda7:tasks": list,
        "camunda7:taskFilters": filters,
      },
      _app: "camunda7",
      _step: "load-tasks",
    }
  },
}
