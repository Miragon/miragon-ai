import { z } from "zod"

export const listDeploymentsInput = z.object({
  name: z.string().optional().describe("Filter by deployment name"),
  nameLike: z.string().optional().describe("Filter by deployment name (substring)"),
  maxResults: z.number().int().positive().optional().default(20),
  sortBy: z.enum(["id", "name", "deploymentTime", "tenantId"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const createDeploymentInput = z.object({
  deploymentName: z.string().describe("Name for the deployment"),
  enableDuplicateFiltering: z
    .boolean()
    .optional()
    .describe("Skip deployment if identical resources already deployed"),
  deployChangedOnly: z
    .boolean()
    .optional()
    .describe("Only deploy resources that have actually changed"),
  deploymentSource: z.string().optional().describe("Source identifier for the deployment"),
  tenantId: z.string().optional().describe("Tenant ID for multi-tenancy"),
  resources: z
    .array(
      z.object({
        name: z.string().describe('Resource file name (e.g. "process.bpmn")'),
        content: z.string().describe("Resource content (BPMN XML, DMN XML, etc.)"),
      }),
    )
    .min(1)
    .describe("Resources to deploy"),
})
