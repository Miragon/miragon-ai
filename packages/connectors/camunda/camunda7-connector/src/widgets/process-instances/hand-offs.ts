import type { ProcessInstanceRow } from "../../view-models.js"
import type { HandOff, ViewContext } from "../lib/hand-off.js"

/** The list's filter chips. */
export type InstanceChip = "all" | "incidents" | "suspended"

/**
 * The filters the list's count covers, as the feed applies them: the chip
 * folded into the handed-in or echoed filters, and the operator's search
 * over a handed-in business-key prefilter. The list's total is the size of
 * THIS set — the hand-offs state it as `matchingInstances` next to these
 * flags, never as the running instances of the engine or the process.
 */
export interface InstancesListFilters {
  active?: boolean
  suspended?: boolean
  withIncidents?: boolean
  /** Operator / caller text — quoted, never inlined. */
  businessKeyLike?: string
}

/**
 * The filters the list's total covers, as the feed receives them: its filter
 * args, with the operator's search replacing a handed-in business-key
 * prefilter (the paged scaffold's `searchArg`).
 */
export function listFiltersOf(
  feedArgs: InstancesListFilters,
  debouncedSearch: string,
): InstancesListFilters {
  return {
    active: feedArgs.active,
    suspended: feedArgs.suspended,
    withIncidents: feedArgs.withIncidents,
    businessKeyLike: debouncedSearch !== "" ? debouncedSearch : feedArgs.businessKeyLike,
  }
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
 * What the operator sees in the instances list: the count of the filtered
 * set with the filters it covers. The process name is the deployer's text
 * and the business-key filter the operator's — both quoted, never inlined.
 */
export function describeInstancesView({
  loadedCount,
  total,
  scopedKey,
  processName,
  engine,
  filters,
}: {
  loadedCount: number
  total: number
  scopedKey: string | null
  processName: string | null
  engine: string | undefined
  filters: InstancesListFilters
}): ViewContext {
  return {
    summary: scopedKey
      ? "The operator is viewing the running instances of one process definition."
      : "The operator is viewing the running instances across ALL process definitions.",
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
