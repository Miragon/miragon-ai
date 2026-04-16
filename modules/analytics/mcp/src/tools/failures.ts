import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { escapeString, type ClickHouseClient } from "../client.js"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerFailureTools(register: Register) {
  register({
    name: "analytics_find_failed_instances",
    description:
      "Find failed process instances with incident details and error patterns. Optionally group by error message to identify common failure patterns.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
      period: z.enum(["1d", "7d", "30d"]).default("7d").describe("Time period to search"),
      incidentType: z.string().optional().describe("Filter by incident type (e.g. failedJob)"),
      groupByError: z
        .boolean()
        .default(false)
        .describe("Group results by error message to show patterns"),
      limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
    },
    handler: async (ch, args) => {
      const interval = { "1d": "1 DAY", "7d": "7 DAY", "30d": "30 DAY" }[
        args.period as "1d" | "7d" | "30d"
      ]

      const baseConditions: string[] = [`create_time >= now() - INTERVAL ${interval}`]
      if (args.processDefinitionKey) {
        baseConditions.push(`process_definition_key = ${escapeString(args.processDefinitionKey)}`)
      }
      if (args.incidentType) {
        baseConditions.push(`incident_type = ${escapeString(args.incidentType)}`)
      }

      const where = baseConditions.join(" AND ")
      const prefixedWhere = baseConditions.map((c) => `i.${c}`).join(" AND ")

      const sql = args.groupByError
        ? `
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
LIMIT ${args.limit}`
        : `
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
LIMIT ${args.limit}`

      return ch.query(sql)
    },
  })
}
