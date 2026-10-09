import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildHistoryTimelineData } from "../data/history-timeline-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, requiredKey, stepEngine } from "./shared.js"

/**
 * The activity timeline of one process instance (first page, exact total) —
 * adapter over {@link buildHistoryTimelineData}, the builder of
 * `camunda7_show_history_timeline`. Consumed by `camunda7:history-timeline`.
 */
export const loadHistoryTimelineStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-history-timeline",
  description:
    "The activity history of one process instance (first page, exact total; the widget pages the rest). Powers camunda7:history-timeline.",
  dataType: "camunda7:historyTimeline",
  requires: ["camunda7:processInstanceId"],
  optionalKeys: [ENGINE_KEY],
  produces: ["camunda7:historyProcessInstance", "camunda7:historyActivities"],
  execute: async (context, appConfig) => {
    const { client, engineId } = await stepEngine(context, appConfig)
    const data = await buildHistoryTimelineData(client, engineId, {
      processInstanceId: requiredKey(context, "camunda7:processInstanceId"),
    })
    return {
      data,
      keys: {
        "camunda7:historyProcessInstance": data.processInstance,
        "camunda7:historyActivities": data.activities,
      },
      _app: "camunda7",
      _step: "load-history-timeline",
    }
  },
}
