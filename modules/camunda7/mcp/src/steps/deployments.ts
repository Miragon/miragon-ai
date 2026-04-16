import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import type { Client, DeploymentBrowserData } from "@automation-mcp/client-camunda7"
import {
  getDeployments,
  getDeploymentResources,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

interface Camunda7AppConfig {
  client: Client
}

interface DeploymentRow {
  id: string
  name?: string | null
  deploymentTime?: string
  source?: string | null
  tenantId?: string | null
}

interface ResourceRow {
  id: string
  name: string
}

/**
 * Loads deployments with their resources.
 * Consumed by `camunda7:deployment-browser`.
 */
export const loadDeploymentsStep: PipelineStepDefinition<Camunda7AppConfig> = {
  id: "camunda7:load-deployments",
  dataType: "camunda7:deploymentBrowser",
  requires: [],
  produces: ["camunda7:deploymentsData"],
  execute: async (_context, appConfig) => {
    const client = appConfig.client

    const deployments = (await getDeployments({
      client,
      query: {
        maxResults: 30,
        sortBy: "deploymentTime",
        sortOrder: "desc",
      },
    })) as unknown as DeploymentRow[]

    const rows = Array.isArray(deployments) ? deployments : []

    // Fetch resources for each deployment (limited to first 20)
    const withResources = await Promise.all(
      rows.slice(0, 20).map(async (dep) => {
        let resources: ResourceRow[] = []
        try {
          const res = (await getDeploymentResources({
            client,
            path: { id: dep.id },
          })) as unknown as ResourceRow[]
          resources = Array.isArray(res) ? res : []
        } catch {
          /* resources unavailable */
        }
        return {
          id: dep.id,
          name: dep.name ?? null,
          deploymentTime: dep.deploymentTime ?? "",
          source: dep.source ?? null,
          tenantId: dep.tenantId ?? null,
          resources: resources.map((r) => ({ id: r.id, name: r.name })),
        }
      }),
    )

    const data: DeploymentBrowserData = {
      totalCount: rows.length,
      deployments: withResources,
    }

    return {
      data,
      keys: { "camunda7:deploymentsData": data },
      _app: "camunda7",
      _step: "load-deployments",
    }
  },
}
