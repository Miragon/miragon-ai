import { z } from "zod"

export const listProcessDefinitionsInput = z.object({
  key: z.string().optional().describe("Filter by exact process definition key"),
  nameLike: z.string().optional().describe("Filter by name (substring match)"),
  latestVersion: z.boolean().optional().describe("Only return latest versions"),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .default(20)
    .describe("Maximum number of results"),
  sortBy: z
    .enum(["category", "key", "id", "name", "version", "deploymentId", "deployTime", "versionTag"])
    .optional()
    .describe("Sort field"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
})

export const getProcessDefinitionXmlInput = z.object({
  processDefinitionId: z.string().describe("The ID of the process definition"),
})
