import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { escapeString, type ClickHouseClient } from "../client.js"

type Register = ReturnType<typeof createToolRegistrar<ClickHouseClient>>

export function registerSearchTools(register: Register) {
  register({
    name: "analytics_search_process_instances",
    description:
      "Search historic process instances using flexible criteria via ClickHouse. Supports filtering by key, state, time range, duration, incidents, and variables.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
      businessKey: z.string().optional().describe("Filter by business key"),
      state: z
        .enum(["ACTIVE", "COMPLETED", "INTERNALLY_TERMINATED", "EXTERNALLY_TERMINATED"])
        .optional()
        .describe("Filter by state"),
      startedAfter: z
        .string()
        .optional()
        .describe("ISO datetime — only instances started after this time"),
      startedBefore: z
        .string()
        .optional()
        .describe("ISO datetime — only instances started before this time"),
      durationGreaterThan: z.number().optional().describe("Minimum duration in milliseconds"),
      withIncidents: z.boolean().optional().describe("Only return instances that have incidents"),
      variableName: z
        .string()
        .optional()
        .describe("Filter by variable name (requires variableValue)"),
      variableValue: z
        .string()
        .optional()
        .describe("Filter by variable value (requires variableName)"),
      sortBy: z
        .enum(["startTime", "endTime", "duration"])
        .default("startTime")
        .describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
      limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
    },
    handler: async (ch, args) => {
      const conditions: string[] = []
      let joins = ""

      if (args.processDefinitionKey) {
        conditions.push(`p.process_definition_key = ${escapeString(args.processDefinitionKey)}`)
      }
      if (args.businessKey) {
        conditions.push(`p.business_key = ${escapeString(args.businessKey)}`)
      }
      if (args.state) {
        conditions.push(`p.state = ${escapeString(args.state)}`)
      }
      if (args.startedAfter) {
        conditions.push(`p.start_time >= ${escapeString(args.startedAfter)}`)
      }
      if (args.startedBefore) {
        conditions.push(`p.start_time <= ${escapeString(args.startedBefore)}`)
      }
      if (args.durationGreaterThan !== undefined) {
        conditions.push(`p.duration_in_millis > ${Number(args.durationGreaterThan)}`)
      }
      if (args.withIncidents) {
        joins += `\nJOIN (SELECT * FROM camunda_history.camunda_incidents FINAL) i ON p.id = i.process_instance_id`
      }
      if (args.variableName && args.variableValue) {
        joins += `\nJOIN (SELECT * FROM camunda_history.camunda_variable_updates FINAL) v ON p.id = v.process_instance_id`
        conditions.push(`v.variable_name = ${escapeString(args.variableName)}`)
        conditions.push(`v.text_value = ${escapeString(args.variableValue)}`)
      }

      const sortColumn = {
        startTime: "p.start_time",
        endTime: "p.end_time",
        duration: "p.duration_in_millis",
      }[args.sortBy as "startTime" | "endTime" | "duration"]

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
ORDER BY ${sortColumn} ${args.sortOrder}
LIMIT ${args.limit}`

      return ch.query(sql)
    },
  })

  register({
    name: "analytics_search_by_variable",
    description:
      "Search process instances by variable name and value. Useful for finding instances by business identifiers like orderId, customerId, etc.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      variableName: z.string().describe("Variable name to search for"),
      variableValue: z.string().describe("Variable value to match (text comparison)"),
      processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
      limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
    },
    handler: async (ch, args) => {
      const conditions: string[] = [
        `v.variable_name = ${escapeString(args.variableName)}`,
        `v.text_value = ${escapeString(args.variableValue)}`,
      ]
      if (args.processDefinitionKey) {
        conditions.push(`p.process_definition_key = ${escapeString(args.processDefinitionKey)}`)
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
LIMIT ${args.limit}`

      return ch.query(sql)
    },
  })
}
