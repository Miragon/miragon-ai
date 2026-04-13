import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client } from "@automation-mcp/client-camunda7"
import {
  getHistoricActivityInstances,
  getHistoricProcessInstances,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

/**
 * Loads the activity execution timeline for a specific process instance.
 * Consumed by `camunda7:history-timeline`.
 */
export const loadHistoryTimelineStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-history-timeline",
  dataType: "camunda7:historyTimeline",
  requires: ["camunda7:processInstanceId"],
  produces: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
  execute: async (context, appConfig) => {
    const client = appConfig.client
    const processInstanceId = context.keys["camunda7:processInstanceId"] as string

    const [activities, instances] = await Promise.all([
      getHistoricActivityInstances({
        client,
        query: {
          processInstanceId,
          sortBy: "startTime",
          sortOrder: "asc",
          maxResults: 500,
        },
      }),
      getHistoricProcessInstances({
        client,
        query: { processInstanceId, maxResults: 1 },
      }),
    ])

    const actArray = Array.isArray(activities) ? activities : []
    const instArray = Array.isArray(instances) ? instances : []
    const processInstance = instArray[0] ?? null

    return {
      data: {
        processInstance,
        activities: actArray,
        totalActivities: actArray.length,
      },
      keys: {
        "camunda7:historyProcessInstance": processInstance,
        "camunda7:historyActivities": actArray,
      },
      _app: "camunda7",
      _step: "load-history-timeline",
    }
  },
}
