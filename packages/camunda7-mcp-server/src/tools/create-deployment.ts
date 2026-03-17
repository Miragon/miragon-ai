import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerCreateDeployment(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'create_deployment',
    'Deploy BPMN process definitions and other resources to the engine. Supports duplicate filtering and deploy-changed-only.',
    {
      deploymentName: z.string().describe('Name for the deployment'),
      enableDuplicateFiltering: z.boolean().optional().describe('Skip deployment if identical resources already deployed'),
      deployChangedOnly: z.boolean().optional().describe('Only deploy resources that have actually changed'),
      deploymentSource: z.string().optional().describe('Source identifier for the deployment'),
      tenantId: z.string().optional().describe('Tenant ID for multi-tenancy'),
      resources: z.array(z.object({
        name: z.string().describe('Resource file name (e.g. "process.bpmn")'),
        content: z.string().describe('Resource content (BPMN XML, DMN XML, etc.)'),
      })).min(1).describe('Resources to deploy'),
    },
    async (params) => {
      const deployment = await adapter.createDeployment({
        deploymentName: params.deploymentName,
        enableDuplicateFiltering: params.enableDuplicateFiltering,
        deployChangedOnly: params.deployChangedOnly,
        deploymentSource: params.deploymentSource,
        tenantId: params.tenantId,
        resources: params.resources.map((r) => ({
          name: r.name,
          content: new TextEncoder().encode(r.content),
        })),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(deployment, null, 2) }] };
    },
  );
}
