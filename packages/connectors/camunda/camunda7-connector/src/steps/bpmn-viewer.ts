import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildBpmnViewerData } from "../data/bpmn-viewer-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, requiredKey, stepEngine } from "./shared.js"

/**
 * One running instance on its diagram, with ITS tokens, incidents and failed
 * jobs — adapter over {@link buildBpmnViewerData}, the builder of
 * `camunda7_show_bpmn_viewer`. Consumed by `camunda7:bpmn-viewer-header`,
 * `camunda7:bpmn-viewer-legend` and `camunda7:bpmn-flow-viewer`.
 */
export const loadBpmnViewerStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-bpmn-viewer",
  description:
    "A running instance's BPMN diagram with its own active activities, incidents and failed jobs. Powers camunda7:bpmn-viewer-header, camunda7:bpmn-viewer-legend and camunda7:bpmn-flow-viewer.",
  dataType: "camunda7:bpmnViewer",
  requires: ["camunda7:processInstanceId"],
  optionalKeys: [ENGINE_KEY],
  produces: ["camunda7:bpmnViewerData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = await stepEngine(context, appConfig)
    const processInstanceId = requiredKey(context, "camunda7:processInstanceId")
    const data = await buildBpmnViewerData(client, engineId, { processInstanceId })
    // A failure, never a success-shaped empty diagram.
    if (!data.processDefinitionId) {
      throw new Error(`Process instance ${processInstanceId} names no process definition.`)
    }
    return {
      data,
      keys: { "camunda7:bpmnViewerData": data },
      _app: "camunda7",
      _step: "load-bpmn-viewer",
    }
  },
}
