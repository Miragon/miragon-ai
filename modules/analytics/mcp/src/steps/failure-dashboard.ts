import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type {
  ClickHouseClient,
  ErrorPatternItem,
  FailureDashboardData,
  ProcessFailureItem,
} from "@miragon-ai/client-analytics"

interface AnalyticsAppConfig {
  client: ClickHouseClient
}

/**
 * Loads aggregated failure / incident analysis from ClickHouse for the
 * `analytics:failure-dashboard` widget. Reads optional filter keys:
 * - `analytics:period` (1d | 7d | 30d | 90d)
 */
export const loadFailureDashboardStep: PipelineStepDefinition<AnalyticsAppConfig> = {
  id: "analytics:load-failure-dashboard",
  description:
    "Aggregated failure / incident analysis grouped by error message and process definition. Powers the failure widgets (failure-summary-kpi, failure-rate-table, error-patterns-table, period-selector).",
  dataType: "analytics:failureDashboard",
  requires: [],
  optionalKeys: [
    {
      key: "analytics:period",
      description: "Time window. Defaults to '7d'.",
      enum: ["1d", "7d", "30d", "90d"],
    },
  ],
  produces: ["analytics:failureDashboardData"],
  execute: async (context, appConfig) => {
    const ch = appConfig.client
    const periodRaw = (context.keys["analytics:period"] as string | undefined) ?? "7d"
    const period = (["1d", "7d", "30d", "90d"] as const).includes(
      periodRaw as "1d" | "7d" | "30d" | "90d",
    )
      ? (periodRaw as "1d" | "7d" | "30d" | "90d")
      : "7d"

    const interval = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY", "90d": "90 DAY" }[period]

    const errorPatternsSql = `
SELECT
    incident_message,
    activity_id,
    process_definition_key,
    count() AS incident_count,
    min(create_time) AS first_occurrence,
    max(create_time) AS last_occurrence,
    groupArray(10)(process_instance_id) AS sample_instance_ids
FROM camunda_history.camunda_incidents FINAL
WHERE create_time >= now() - INTERVAL ${interval}
GROUP BY incident_message, activity_id, process_definition_key
ORDER BY incident_count DESC
LIMIT 50`

    const processFailuresSql = `
SELECT
    process_definition_key,
    count() AS total_instances,
    countIf(state = 'INTERNALLY_TERMINATED') AS failed_count,
    round(countIf(state = 'INTERNALLY_TERMINATED') * 100.0 / count(), 2) AS failure_rate_pct
FROM (
    SELECT
        id,
        any(process_definition_key) AS process_definition_key,
        argMax(state, timestamp) AS state,
        min(start_time) AS start_time
    FROM camunda_history.camunda_process_instances
    GROUP BY id
) sub
WHERE start_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key
HAVING failed_count > 0
ORDER BY failed_count DESC`

    const incidentsByProcessSql = `
SELECT
    process_definition_key,
    count() AS incident_count
FROM camunda_history.camunda_incidents FINAL
WHERE create_time >= now() - INTERVAL ${interval}
GROUP BY process_definition_key`

    interface ErrorPatternQueryRow {
      incident_message: string | null
      activity_id: string | null
      process_definition_key: string | null
      incident_count: number
      first_occurrence: string | null
      last_occurrence: string | null
      sample_instance_ids: string[] | null
    }
    interface ProcessFailureQueryRow {
      process_definition_key: string
      total_instances: number
      failed_count: number
      failure_rate_pct: number
    }

    const [errorPatterns, processFailures, incidentsByProcess] = await Promise.all([
      ch.query<ErrorPatternQueryRow>(errorPatternsSql),
      ch.query<ProcessFailureQueryRow>(processFailuresSql),
      ch.query<{ process_definition_key: string; incident_count: number }>(incidentsByProcessSql),
    ])

    const incidentMap = new Map<string, number>()
    for (const row of incidentsByProcess) {
      incidentMap.set(row.process_definition_key, Number(row.incident_count))
    }

    const totalIncidents = errorPatterns.reduce((s, r) => s + Number(r.incident_count ?? 0), 0)

    const processBreakdown: ProcessFailureItem[] = processFailures.map((p) => ({
      processDefinitionKey: p.process_definition_key,
      totalInstances: Number(p.total_instances),
      failedCount: Number(p.failed_count),
      incidentCount: incidentMap.get(p.process_definition_key) ?? 0,
      failureRatePct: Number(p.failure_rate_pct),
    }))

    const mostAffectedProcess =
      processBreakdown.length > 0 ? processBreakdown[0].processDefinitionKey : null

    const errorPatternItems: ErrorPatternItem[] = errorPatterns.map((r) => ({
      incidentMessage: r.incident_message ?? "",
      activityId: r.activity_id ?? "",
      processDefinitionKey: r.process_definition_key ?? "",
      incidentCount: Number(r.incident_count),
      firstOccurrence: r.first_occurrence ?? "",
      lastOccurrence: r.last_occurrence ?? "",
      sampleInstanceIds: Array.isArray(r.sample_instance_ids) ? r.sample_instance_ids : [],
    }))

    const data: FailureDashboardData = {
      totalIncidents,
      uniqueErrorPatterns: errorPatterns.length,
      mostAffectedProcess,
      period,
      errorPatterns: errorPatternItems,
      processBreakdown,
    }

    return {
      data,
      keys: { "analytics:failureDashboardData": data },
      _app: "analytics",
      _step: "load-failure-dashboard",
    }
  },
}
