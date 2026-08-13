import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildBpmnViewerData } from "../data/bpmn-viewer-data.js"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads data needed to render a BPMN diagram with activity overlays.
 * Consumed by `camunda7:bpmn-viewer`. Thin wrapper over the shared
 * {@link buildBpmnViewerData} builder — the same data path the
 * `camunda7_show_bpmn_viewer` widget tool uses, so the two render paths
 * cannot drift.
 */
export const loadBpmnViewerStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-bpmn-viewer",
  dataType: "camunda7:bpmnViewer",
  requires: ["camunda7:processInstanceId"],
  produces: ["camunda7:bpmnViewerData"],
  execute: async (context, appConfig) => {
    const { client, engineId } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
    const processInstanceId = context.keys["camunda7:processInstanceId"] as string

    const data = await buildBpmnViewerData(client, engineId, { processInstanceId })

    return {
      data,
      keys: { "camunda7:bpmnViewerData": data.processDefinitionId ? data : null },
      _app: "camunda7",
      _step: "load-bpmn-viewer",
    }
  },
}
