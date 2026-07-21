import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { HistoryTimelineData } from "../view-models.js"
import {
  getHistoricActivityInstances,
  getHistoricProcessInstances,
} from "@miragon-ai/client-camunda7/sdk"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads the activity execution timeline for a specific process instance.
 * Consumed by `camunda7:history-timeline`.
 */
export const loadHistoryTimelineStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-history-timeline",
  dataType: "camunda7:historyTimeline",
  requires: ["camunda7:processInstanceId"],
  produces: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
  execute: async (context, appConfig) => {
    const { client } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
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

    const actArray = (
      Array.isArray(activities) ? activities : []
    ) as HistoryTimelineData["activities"]
    const instArray = (
      Array.isArray(instances) ? instances : []
    ) as HistoryTimelineData["processInstance"][]
    const processInstance = instArray[0] ?? null

    return {
      data: {
        processInstance,
        activities: actArray,
        totalActivities: actArray.length,
      } satisfies HistoryTimelineData,
      keys: {
        "camunda7:historyProcessInstance": processInstance,
        "camunda7:historyActivities": actArray,
      },
      _app: "camunda7",
      _step: "load-history-timeline",
    }
  },
}
