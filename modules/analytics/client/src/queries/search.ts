import { escapeString, type ClickHouseClient } from "../clickhouse.js"

export interface ProcessInstanceSearchRow {
  process_instance_id: string
  process_definition_key: string
  process_definition_name: string | null
  business_key: string | null
  state: string
  start_time: string
  end_time: string | null
  duration_in_millis: number | null
  start_user_id: string | null
}

export interface VariableSearchRow {
  process_instance_id: string
  process_definition_key: string
  business_key: string | null
  state: string
  start_time: string
  end_time: string | null
  duration_in_millis: number | null
  variable_name: string
  text_value: string
}

export async function searchProcessInstances(
  ch: ClickHouseClient,
  params: {
    processDefinitionKey?: string
    businessKey?: string
    state?: string
    startedAfter?: string
    startedBefore?: string
    durationGreaterThan?: number
    withIncidents?: boolean
    variableName?: string
    variableValue?: string
    sortBy: string
    sortOrder: string
    limit: number
  },
): Promise<ProcessInstanceSearchRow[]> {
  const conditions: string[] = []
  let joins = ""

  if (params.processDefinitionKey) {
    conditions.push(`p.process_definition_key = ${escapeString(params.processDefinitionKey)}`)
  }
  if (params.businessKey) {
    conditions.push(`p.business_key = ${escapeString(params.businessKey)}`)
  }
  if (params.state) {
    conditions.push(`p.state = ${escapeString(params.state)}`)
  }
  if (params.startedAfter) {
    conditions.push(`p.start_time >= ${escapeString(params.startedAfter)}`)
  }
  if (params.startedBefore) {
    conditions.push(`p.start_time <= ${escapeString(params.startedBefore)}`)
  }
  if (params.durationGreaterThan !== undefined) {
    conditions.push(`p.duration_in_millis > ${Number(params.durationGreaterThan)}`)
  }
  if (params.withIncidents) {
    joins += `\nJOIN (SELECT * FROM camunda_history.camunda_incidents FINAL) i ON p.id = i.process_instance_id`
  }
  if (params.variableName && params.variableValue) {
    joins += `\nJOIN (SELECT * FROM camunda_history.camunda_variable_updates FINAL) v ON p.id = v.process_instance_id`
    conditions.push(`v.variable_name = ${escapeString(params.variableName)}`)
    conditions.push(`v.text_value = ${escapeString(params.variableValue)}`)
  }

  const sortColumn = {
    startTime: "p.start_time",
    endTime: "p.end_time",
    duration: "p.duration_in_millis",
  }[params.sortBy as "startTime" | "endTime" | "duration"]

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const sql = `
SELECT DISTINCT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.process_definition_name,
    p.business_key,
    p.state,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    p.start_user_id
FROM camunda_history.camunda_process_instances p${joins}
${where}
ORDER BY ${sortColumn} ${params.sortOrder}
LIMIT ${params.limit}`

  return ch.query<ProcessInstanceSearchRow>(sql)
}

export async function searchByVariable(
  ch: ClickHouseClient,
  params: {
    variableName: string
    variableValue: string
    processDefinitionKey?: string
    limit: number
  },
): Promise<VariableSearchRow[]> {
  const conditions: string[] = [
    `v.variable_name = ${escapeString(params.variableName)}`,
    `v.text_value = ${escapeString(params.variableValue)}`,
  ]
  if (params.processDefinitionKey) {
    conditions.push(`p.process_definition_key = ${escapeString(params.processDefinitionKey)}`)
  }

  const sql = `
SELECT DISTINCT
    p.id AS process_instance_id,
    p.process_definition_key,
    p.business_key,
    p.state,
    p.start_time,
    p.end_time,
    p.duration_in_millis,
    v.variable_name,
    v.text_value
FROM (SELECT * FROM camunda_history.camunda_variable_updates FINAL) v
JOIN camunda_history.camunda_process_instances p ON p.id = v.process_instance_id
WHERE ${conditions.join(" AND ")}
ORDER BY v.timestamp DESC
LIMIT ${params.limit}`

  return ch.query<VariableSearchRow>(sql)
}
