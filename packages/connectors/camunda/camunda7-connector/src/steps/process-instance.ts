import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildInstanceDetailData } from "../data/instance-detail-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, requiredKey, stepEngine } from "./shared.js"

/**
 * One running process instance: state, activity tree, variables, open
 * incidents and user tasks, BPMN. Adapter over {@link buildInstanceDetailData},
 * the builder of `camunda7_show_instance_detail` (cockpit links included).
 * Consumed by `camunda7:instance-detail`.
 */
export const loadProcessInstanceStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-instance",
  description:
    "One running process instance: state, activity tree, variables, open incidents and user tasks, BPMN. Powers camunda7:instance-detail.",
  dataType: "camunda7:processInstance",
  requires: ["camunda7:processInstanceId"],
  optionalKeys: [ENGINE_KEY],
  produces: [
    "camunda7:instance",
    "camunda7:activityTree",
    "camunda7:variables",
    "camunda7:incidents",
    "camunda7:bpmnXml",
  ],
  execute: async (context, appConfig) => {
    const { client, engineId, baseUrl, cockpitUrl, provider } = await stepEngine(context, appConfig)
    const data = await buildInstanceDetailData(
      client,
      engineId,
      { processInstanceId: requiredKey(context, "camunda7:processInstanceId") },
      { baseUrl, cockpitUrl, provider },
    )
    return {
      data,
      keys: {
        "camunda7:instance": data.instance,
        "camunda7:activityTree": data.activityTree,
        "camunda7:variables": data.variables,
        "camunda7:incidents": data.incidents,
        "camunda7:bpmnXml": data.bpmnXml,
      },
      _app: "camunda7",
      _step: "load-process-instance",
    }
  },
}
