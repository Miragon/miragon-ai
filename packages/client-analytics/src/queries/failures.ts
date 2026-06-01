import {
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"

export interface ErrorPatternRow {
  incident_message: string
  activity_id: string
  process_definition_key: string
  incident_count: number
  first_occurrence: string
  last_occurrence: string
  sample_instance_ids: string[]
}

export interface FailedInstanceRow {
  process_instance_id: string
  process_definition_key: string
  business_key: string | null
  start_time: string
  end_time: string | null
  duration_in_millis: number | null
  incident_type: string
  incident_message: string
  failed_activity: string
  incident_time: string
}

const RANGE = { "1d": "1d", "7d": "7d", "30d": "30d" } as const

/**
 * Failure patterns over a rolling window, from incident metrics.
 *
 * Reduced fidelity vs the event store: metrics carry no raw incident messages
 * (only `incident_type`), no per-instance ids, and no first/last timestamps —
 * so patterns are grouped by `incident_type` + activity + definition, with
 * `incident_message` set to the type and `sample_instance_ids` empty. For the
 * actual failed instances, drill in with `camunda7_list_incidents` /
 * `camunda7_query_historic_process_instances`.
 */
export async function findFailedInstances(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    period: string
    incidentType?: string
    groupByError: boolean
    limit: number
    engineId?: EngineFilterInput
  },
): Promise<ErrorPatternRow[] | FailedInstanceRow[]> {
  const range = RANGE[params.period as keyof typeof RANGE] ?? "7d"
  const limit = Math.max(1, Math.floor(params.limit))
  const sel = selector(
    params.processDefinitionKey
      ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
      : undefined,
    params.incidentType ? `incident_type="${escapeLabelValue(params.incidentType)}"` : undefined,
    engineMatcher(params.engineId),
  )

  const samples = await ch.instant(
    `sum by (process_definition_key, activity_id, incident_type)(increase(camunda_incident_created_total${sel}[${range}]))`,
  )

  return samples
    .map((s) => ({
      incident_message: s.metric.incident_type ?? "",
      activity_id: s.metric.activity_id ?? "",
      process_definition_key: s.metric.process_definition_key ?? "",
      incident_count: Math.round(s.value),
      first_occurrence: "",
      last_occurrence: "",
      sample_instance_ids: [],
    }))
    .filter((r) => r.incident_count > 0)
    .sort((a, b) => b.incident_count - a.incident_count)
    .slice(0, limit)
}
