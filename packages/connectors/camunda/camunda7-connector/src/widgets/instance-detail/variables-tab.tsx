import { HandOffButton } from "@miragon-ai/widget-shell/widgets"
import type { VariableValue } from "../../view-models.js"
import { VariablesTable } from "../instance-sections.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"

/**
 * Sanity-check ONE instance's variables. The values stay in the engine: the
 * model reads them through the tool (whose output hosts treat as data), and a
 * fix is only ever proposed.
 */
export function checkVariablesHandOff(
  instanceId: string,
  definitionId: string,
  engineId: string | undefined,
): HandOff {
  return {
    intent: "askAi.instance.checkVariables",
    ids: { engine: engineId, processInstanceId: instanceId, processDefinitionId: definitionId },
    tools: [
      "camunda7_get_process_instance_variables",
      "camunda7_list_incidents",
      "camunda7_set_process_instance_variable",
    ],
  }
}

/** The "Variables" tab body — AI sanity-check handoff plus the editable table. */
export function VariablesTab({
  variables,
  instanceId,
  definitionId,
  engineId,
  readOnly,
}: {
  variables: Record<string, VariableValue>
  instanceId: string
  definitionId: string
  engineId?: string
  readOnly: boolean
}) {
  const { ask } = useHandOff()
  return (
    <>
      <div className="mb-2">
        <HandOffButton
          action="checkVariables"
          prompt={ask(checkVariablesHandOff(instanceId, definitionId, engineId))}
        />
      </div>
      <VariablesTable
        variables={variables}
        instanceId={instanceId}
        engine={engineId}
        readOnly={readOnly}
      />
    </>
  )
}
