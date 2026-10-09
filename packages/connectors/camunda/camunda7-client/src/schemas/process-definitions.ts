import { z } from "zod"
import {
  firstResultParam,
  flagParam,
  likeParam,
  maxResultsParam,
  sortOrderParam,
} from "./shared.js"

export const listProcessDefinitionsInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by exact process definition key"),
  nameLike: likeParam("Filter by name"),
  latestVersion: flagParam("true = only the latest version of each definition"),
  firstResult: firstResultParam,
  maxResults: maxResultsParam(),
  sortBy: z
    .enum(["category", "key", "id", "name", "version", "deploymentId", "deployTime", "versionTag"])
    .optional()
    .describe("Sort field"),
  sortOrder: sortOrderParam,
})

export const getProcessDefinitionXmlInput = z.object({
  processDefinitionId: z.string().describe("The ID of the process definition"),
})
