import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import {
  getProcessInstance,
  getActivityInstanceTree,
  getProcessInstanceVariables,
  getIncidents,
  getProcessDefinitionBpmn20Xml,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Loads the full detail of a single process instance: core instance data,
 * activity instance tree, variables, incidents, and optionally the BPMN XML of
 * the underlying process definition. Widget `camunda7:instance-detail` reads
 * these keys.
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
    const { client } = resolveStepEngine(
      appConfig,
      context.keys["camunda7:engine"] as string | undefined,
    )
    const processInstanceId = context.keys["camunda7:processInstanceId"] as string

    const [instance, activityTree, variables, incidents] = await Promise.all([
      getProcessInstance({ client, path: { id: processInstanceId } }),
      getActivityInstanceTree({ client, path: { id: processInstanceId } }).catch(() => null),
      getProcessInstanceVariables({ client, path: { id: processInstanceId } }).catch(() => ({})),
      getIncidents({
        client,
        query: { processInstanceId, maxResults: 100 },
      }).catch(() => []),
    ])

    let bpmnXml: string | null = null
    const definitionId = (instance as { definitionId?: string } | null)?.definitionId
    if (definitionId) {
      try {
        const xmlResponse = await getProcessDefinitionBpmn20Xml({
          client,
          path: { id: definitionId },
        })
        bpmnXml = (xmlResponse as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null
      } catch {
        bpmnXml = null
      }
    }

    return {
      data: { instance, activityTree, variables, incidents, bpmnXml },
      keys: {
        "camunda7:instance": instance,
        "camunda7:activityTree": activityTree,
        "camunda7:variables": variables,
        "camunda7:incidents": incidents,
        "camunda7:bpmnXml": bpmnXml,
      },
      _app: "camunda7",
      _step: "load-process-instance",
    }
  },
}
