import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';

export function registerResources(server: McpServer, adapter: EngineAdapter): void {
  // Resource: List all process definitions
  server.resource(
    'process-definitions',
    'camunda7://process-definitions',
    { description: 'List of all deployed process definitions with version info' },
    async () => {
      const definitions = await adapter.listProcessDefinitions({ latestVersion: true, maxResults: 100 });
      return {
        contents: [{
          uri: 'camunda7://process-definitions',
          mimeType: 'application/json',
          text: JSON.stringify(definitions, null, 2),
        }],
      };
    },
  );

  // Resource Template: BPMN XML for a process definition
  server.resource(
    'process-xml',
    'camunda7://process/{key}/xml',
    { description: 'BPMN XML of a process definition by key' },
    async (uri) => {
      const key = uri.pathname.split('/')[2];
      // First find the latest version by key
      const definitions = await adapter.listProcessDefinitions({ key, latestVersion: true, maxResults: 1 });
      if (definitions.length === 0) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: `No process definition found for key: ${key}`,
          }],
        };
      }
      const xml = await adapter.getProcessDefinitionXml(definitions[0].id);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/xml',
          text: xml,
        }],
      };
    },
  );

  // Resource Template: Process statistics
  server.resource(
    'process-stats',
    'camunda7://process/{key}/stats',
    { description: 'Instance statistics for a process definition by key' },
    async (uri) => {
      const key = uri.pathname.split('/')[2];
      const [active, incidents] = await Promise.all([
        adapter.listProcessInstances({ processDefinitionKey: key, active: true, maxResults: 0 }),
        adapter.listIncidents({ processDefinitionId: key }),
      ]);

      const stats = {
        processDefinitionKey: key,
        activeInstances: active.length,
        openIncidents: incidents.length,
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(stats, null, 2),
        }],
      };
    },
  );
}
