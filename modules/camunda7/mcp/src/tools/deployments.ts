import type { Client } from "@miragon-ai/client-camunda7"
import { listDeploymentsInput, createDeploymentInput } from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getDeployments, createDeployment } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerDeploymentTools(register: Register) {
  register({
    name: "camunda7_list_deployments",
    description: "List deployments with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listDeploymentsInput.shape,
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
    inputSchema: createDeploymentInput.shape,
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
