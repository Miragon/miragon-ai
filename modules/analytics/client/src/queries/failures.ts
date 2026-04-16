import { escapeString, type ClickHouseClient } from "../clickhouse.js"

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

export async function findFailedInstances(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey?: string
    period: string
    incidentType?: string
    groupByError: boolean
    limit: number
  },
): Promise<ErrorPatternRow[] | FailedInstanceRow[]> {
  const interval = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY" }[
    params.period as "1d" | "7d" | "30d"
  ]

  const baseConditions: string[] = [`create_time >= now() - INTERVAL ${interval}`]
  if (params.processDefinitionKey) {
    baseConditions.push(`process_definition_key = ${escapeString(params.processDefinitionKey)}`)
  }
  if (params.incidentType) {
    baseConditions.push(`incident_type = ${escapeString(params.incidentType)}`)
  }

  const where = baseConditions.join(" AND ")
  const prefixedWhere = baseConditions.map((c) => `i.${c}`).join(" AND ")

  if (params.groupByError) {
    const sql = `
SELECT
    incident_message,
    activity_id,
    process_definition_key,
    count() AS incident_count,
    min(create_time) AS first_occurrence,
    max(create_time) AS last_occurrence,
    groupArray(10)(process_instance_id) AS sample_instance_ids
FROM camunda_history.camunda_incidents FINAL
WHERE ${where}
GROUP BY incident_message, activity_id, process_definition_key
ORDER BY incident_count DESC
LIMIT ${params.limit}`
    return ch.query<ErrorPatternRow>(sql)
  }

  const sql = `
SELECT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    i.incident_type,
    i.incident_message,
    i.activity_id AS failed_activity,
    i.create_time AS incident_time
FROM (SELECT * FROM camunda_history.camunda_incidents FINAL) i
JOIN camunda_history.camunda_process_instances p ON p.id = i.process_instance_id
WHERE ${prefixedWhere}
ORDER BY i.create_time DESC
LIMIT ${params.limit}`

  return ch.query<FailedInstanceRow>(sql)
}
