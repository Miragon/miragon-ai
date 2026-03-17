import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EngineAdapter } from '@camunda7-mcp/engine-adapter';
import { z } from 'zod';

export function registerGetProcessDefinitionXml(server: McpServer, adapter: EngineAdapter): void {
  server.tool(
    'get_process_definition_xml',
    'Get the BPMN 2.0 XML of a process definition by ID. Returns the raw BPMN XML string.',
    { processDefinitionId: z.string().describe('The ID of the process definition') },
    async (params) => {
      const xml = await adapter.getProcessDefinitionXml(params.processDefinitionId);
      return { content: [{ type: 'text' as const, text: xml }] };
    },
  );
}
