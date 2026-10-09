import type { ProcessInstanceRow } from "../../view-models.js"
import type { HandOff, ViewContext } from "../lib/hand-off.js"

/** The list's filter chips, as the model context names them. */
export type InstanceChip = "all" | "incidents" | "suspended"

/**
 * Root cause of ONE incident-affected instance, then whether its process fails
 * the same way elsewhere. The business key is the starter's text — quoted.
 */
export function rootCauseHandOff(
  row: ProcessInstanceRow,
  processDefinitionKey: string | null,
  engine: string | undefined,
): HandOff {
  return {
    intent: "askAi.instances.rootCause",
    ids: {
      engine,
      processInstanceId: row.id,
      processDefinitionKey: processDefinitionKey ?? row.processDefinitionKey,
    },
    facts: { version: row.version },
    untrusted: [{ label: "businessKey", text: row.businessKey }],
    tools: [
      "camunda7_get_process_instance",
      "camunda7_list_incidents",
      "camunda7_get_job_stacktrace",
      "camunda7_query_historic_incidents",
      "camunda7_get_process_instance_variables",
    ],
  }
}

/**
 * What the operator sees in the instances list. The process name is the
 * deployer's text and the search the operator's — both quoted, never inlined.
 */
export function describeInstancesView({
  loadedCount,
  total,
  scopedKey,
  processName,
  engine,
  activeChip,
  debouncedSearch,
}: {
  loadedCount: number
  total: number
  scopedKey: string | null
  processName: string | null
  engine: string | undefined
  activeChip: InstanceChip
  debouncedSearch: string
}): ViewContext {
  return {
    summary: scopedKey
      ? "The operator is viewing the running instances of one process definition."
      : "The operator is viewing the running instances across ALL process definitions.",
    ids: { engine, processDefinitionKey: scopedKey },
    facts: {
      loaded: loadedCount,
      total,
      filter: activeChip !== "all" ? activeChip : undefined,
    },
    untrusted: [
      { label: "processName", text: processName },
      { label: "businessKeySearch", text: debouncedSearch },
    ],
    tools: [
      "camunda7_show_instance_detail",
      "camunda7_list_incidents",
      "camunda7_set_process_instance_suspension",
      "camunda7_delete_process_instance",
      "camunda7_set_job_retries",
    ],
  }
}
