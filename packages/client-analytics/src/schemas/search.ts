import { z } from "zod"
import { engineFilterShape } from "./shared.js"

export const searchProcessInstancesInput = z.object({
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
  variableName: z.string().optional().describe("Filter by variable name (requires variableValue)"),
  variableValue: z.string().optional().describe("Filter by variable value (requires variableName)"),
  sortBy: z.enum(["startTime", "endTime", "duration"]).default("startTime").describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
  ...engineFilterShape,
})

export const searchByVariableInput = z.object({
  variableName: z.string().describe("Variable name to search for"),
  variableValue: z.string().describe("Variable value to match (text comparison)"),
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  limit: z.number().int().positive().max(100).default(20).describe("Maximum results"),
  ...engineFilterShape,
})
