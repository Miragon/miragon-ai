import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildInstanceDetailData } from "../data/cockpit-data.js"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads the full detail of a single process instance: core instance data,
 * activity instance tree, variables, incidents, BPMN XML, and open user tasks.
 * Thin adapter over {@link buildInstanceDetailData} — the same builder the
 * `camunda7_show_instance_detail` widget tool uses. Widget
 * `camunda7:instance-detail` reads these keys.
 */
export const loadProcessInstanceStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-instance",
  dataType: "camunda7:processInstance",
  requires: ["camunda7:processInstanceId"],
  produces: [
    "camunda7:instance",
    "camunda7:activityTree",
    "camunda7:variables",
    "camunda7:incidents",
    "camunda7:bpmnXml",
  ],
  execute: async (context, appConfig) => {
    const { client, engineId } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
    const processInstanceId = context.keys["camunda7:processInstanceId"] as string

    const data = await buildInstanceDetailData(client, engineId, { processInstanceId })

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
