import { z } from "zod"
import type { Client } from "@miragon-ai/client-camunda7"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getDeployments, createDeployment } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerDeploymentTools(register: Register) {
  register({
    name: "camunda7_list_deployments",
    description: "List deployments with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      name: z.string().optional().describe("Filter by deployment name"),
      nameLike: z.string().optional().describe("Filter by deployment name (substring)"),
      maxResults: z.number().int().positive().optional().default(20),
      sortBy: z.enum(["id", "name", "deploymentTime", "tenantId"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    },
    handler: async (client, args) =>
      getDeployments({
        client,
        query: {
          name: args.name,
          nameLike: args.nameLike,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_create_deployment",
    description:
      "Deploy BPMN process definitions and other resources to the engine. Supports duplicate filtering and deploy-changed-only.",
    annotations: { openWorldHint: true },
    inputSchema: {
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
    },
    handler: async (client, args) => {
      const form = new FormData()
      form.append("deployment-name", args.deploymentName)
      if (args.enableDuplicateFiltering !== undefined) {
        form.append("enable-duplicate-filtering", String(args.enableDuplicateFiltering))
      }
      if (args.deployChangedOnly !== undefined) {
        form.append("deploy-changed-only", String(args.deployChangedOnly))
      }
      if (args.deploymentSource) form.append("deployment-source", args.deploymentSource)
      if (args.tenantId) form.append("tenant-id", args.tenantId)
      for (const resource of args.resources) {
        form.append(resource.name, new Blob([resource.content]), resource.name)
      }
      return createDeployment({
        client,
        body: form as unknown as Parameters<typeof createDeployment>[0] extends {
          body?: infer B
        }
          ? B
          : never,
      })
    },
  })
}
