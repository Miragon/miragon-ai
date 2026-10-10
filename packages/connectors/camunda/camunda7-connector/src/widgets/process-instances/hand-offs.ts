import type { ProcessInstanceRow } from "../../view-models.js"
import type { HandOff, ViewContext } from "../lib/hand-off.js"

/** The list's filter chips. */
export type InstanceChip = "all" | "incidents" | "suspended"

/**
 * The filters the list's count covers: the feed's echo (`filters`) of the
 * page ON SCREEN — the chip folded into the handed-in filters, the
 * operator's search over a handed-in business-key prefilter. The list's
 * total is the size of THIS set — the hand-offs state it as
 * `matchingInstances` next to these flags, never as the running instances
 * of the engine or the process. Read from the payload, never from the
 * request: while a new search or chip is in flight or has failed the list
 * shows the previous result, and the new filters next to its count would be
 * a pair nobody fetched.
 */
export interface InstancesListFilters {
  active?: boolean
  suspended?: boolean
  withIncidents?: boolean
  /** Operator / caller text — quoted, never inlined. */
  businessKeyLike?: string
}

/** The run-state and incident flags of {@link InstancesListFilters}, as on-screen facts. */
export function instancesFilterFacts(filters: InstancesListFilters) {
  return {
    active: filters.active,
    suspended: filters.suspended,
    withIncidents: filters.withIncidents,
  }
}

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
 * While the operator's newer search or chip has not answered (in flight, or
 * failed) the list keeps its previous result — the model hears that the
 * counts and filters it gets are that result's, not the new request's.
 */
const PREVIOUS_RESULT_NOTE =
  " The operator has changed the search or filter, but the new result has not loaded (still loading, or failed): the list still shows its PREVIOUS result, which the numbers and filters below describe."

/**
 * What the operator sees in the instances list: the count of the filtered
 * set with the filters it covers (both from the page on screen — see
 * {@link InstancesListFilters}). The process name is the deployer's text
 * and the business-key filter the operator's — both quoted, never inlined.
 */
export function describeInstancesView({
  loadedCount,
  total,
  scopedKey,
  processName,
  engine,
  filters,
  previousResult,
}: {
  loadedCount: number
  total: number
  scopedKey: string | null
  processName: string | null
  engine: string | undefined
  filters: InstancesListFilters
  /** The rows on screen are the previous result (`paged.stale`). */
  previousResult: boolean
}): ViewContext {
  const view = scopedKey
    ? "The operator is viewing the running instances of one process definition."
    : "The operator is viewing the running instances across ALL process definitions."
  return {
    summary: previousResult ? view + PREVIOUS_RESULT_NOTE : view,
    ids: { engine, processDefinitionKey: scopedKey },
    facts: {
      loaded: loadedCount,
      matchingInstances: total,
      ...instancesFilterFacts(filters),
    },
    untrusted: [
      { label: "processName", text: processName },
      { label: "businessKeyLike", text: filters.businessKeyLike },
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
