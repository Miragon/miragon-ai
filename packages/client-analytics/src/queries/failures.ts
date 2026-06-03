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

/**
 * Currently-open incident patterns, from the `camunda_incidents_open` state
 * gauge — grouped by `incident_type` + definition. Point-in-time ("what is
 * failing now"), so it is robust regardless of how the data arrived (live or
 * a backdated/bulk import, where `increase()` over a rate window reads zero).
 *
 * Reduced fidelity vs the event store: no raw incident messages (only
 * `incident_type`, surfaced as `incident_message`), no activity id, no
 * per-instance ids/timestamps. For the actual failed instances drill in with
 * `camunda7_list_incidents` / `camunda7_query_historic_process_instances`.
 */
export async function findFailedInstances(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    incidentType?: string
    limit: number
    engineId?: EngineFilterInput
  },
): Promise<ErrorPatternRow[]> {
  const limit = Math.max(1, Math.floor(params.limit))
  const sel = selector(
    params.processDefinitionKey
      ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
      : undefined,
    params.incidentType ? `incident_type="${escapeLabelValue(params.incidentType)}"` : undefined,
    engineMatcher(params.engineId),
  )

  const samples = await ch.instant(
    `sum by (process_definition_key, incident_type)(camunda_incidents_open${sel})`,
  )

  return samples
    .map((s) => ({
      incident_message: s.metric.incident_type ?? "",
      activity_id: "",
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
