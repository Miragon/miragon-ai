import { AskAiButton } from "@miragon-ai/widget-shell/widgets"

import type { VariableValue } from "../../view-models.js"
import { VariablesTable } from "../instance-sections.js"
import { useT } from "../../messages/use-t.js"

/** The "Variables" tab body — AI sanity-check handoff plus the editable table. */
export function VariablesTab({
  variables,
  instanceId,
  definitionId,
  engineId,
  engineClause,
  readOnly,
}: {
  variables: Record<string, VariableValue>
  instanceId: string
  definitionId: string
  engineId?: string
  engineClause: string
  readOnly: boolean
}) {
  const t = useT()
  return (
    <>
      <div className="mb-2">
        <AskAiButton
          variant="subtle"
          label={t("instanceDetail.explainVariables")}
          prompt={`Explain and sanity-check the variables of CIB Seven process instance ${instanceId} (definition ${definitionId}${engineClause}). Use camunda7_get_process_instance_variables(processInstanceId: "${instanceId}") for the authoritative values. For each meaningful variable say what it represents, and flag any value that looks missing, malformed, or inconsistent and could explain the current incident(s). If you find a likely-bad variable, propose the corrected value — but do not set it without my confirmation.`}
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
