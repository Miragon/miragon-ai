import {
  engineIdsOf,
  engineMatcher,
  escapeLabelValue,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

/**
 * One group of currently-open incidents. Only what the `camunda_incidents_open`
 * gauge carries: no message, activity, timestamps or instance ids exist on it.
 */
export interface ErrorPatternRow {
  incident_type: string
  process_definition_key: string
  incident_count: number
}

export interface FailedInstancesResult {
  /** The engine ids covered; `null` = every engine Prometheus holds (unscoped library call). */
  engines: string[] | null
  /** Open-incident groups, largest first, capped at `maxResults`. */
  patterns: ErrorPatternRow[]
}

/**
 * Currently-open incident groups, from the `camunda_incidents_open` state
 * gauge — grouped by `incident_type` + definition. Point-in-time ("what is
 * failing now"), so it is robust regardless of how the data arrived (live or
 * a backdated/bulk import, where `increase()` over a rate window reads zero).
 *
 * The gauge carries no incident message, activity id, timestamps or instance
 * ids, so the rows carry none either. For the actual failed instances drill
 * in with `camunda7_list_incidents` / `camunda7_query_historic_incidents`.
 */
export async function findFailedInstances(
  ch: PrometheusClient,
  params: {
    processDefinitionKey?: string
    incidentType?: string
    maxResults: number
    engine?: EngineFilterInput
  },
): Promise<FailedInstancesResult> {
  const limit = Math.max(1, Math.floor(params.maxResults))
  const sel = selector(
    params.processDefinitionKey
      ? `process_definition_key="${escapeLabelValue(params.processDefinitionKey)}"`
      : undefined,
    params.incidentType ? `incident_type="${escapeLabelValue(params.incidentType)}"` : undefined,
    engineMatcher(params.engine),
  )

  const samples = await ch.instant(
    `sum by (process_definition_key, incident_type)(${M.incidentsOpen}${sel})`,
  )

  const patterns = samples
    .map((s) => ({
      incident_type: s.metric.incident_type ?? "",
      process_definition_key: s.metric.process_definition_key ?? "",
      incident_count: Math.round(s.value),
    }))
    .filter((r) => r.incident_count > 0)
    .sort((a, b) => b.incident_count - a.incident_count)
    .slice(0, limit)
  return { engines: engineIdsOf(params.engine), patterns }
}
