import type { Client } from "@automation-mcp/client-camunda7"
import {
  listProcessDefinitionsInput,
  getProcessDefinitionXmlInput,
} from "@automation-mcp/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
} from "@automation-mcp/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerProcessDefinitionTools(register: Register) {
  register({
    name: "camunda7_list_process_definitions",
    description:
      "List deployed process definitions with optional filters. Returns key, name, version, and deployment info.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: listProcessDefinitionsInput.shape,
    handler: async (client, args) =>
      getProcessDefinitions({
        client,
        query: {
          key: args.key,
          nameLike: args.nameLike,
          latestVersion: args.latestVersion,
          maxResults: args.maxResults,
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
        },
      }),
  })

  register({
    name: "camunda7_get_process_definition_xml",
    description:
      "Get the BPMN 2.0 XML of a process definition by ID. Returns the raw BPMN XML string.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getProcessDefinitionXmlInput.shape,
    handler: async (client, args) =>
      getProcessDefinitionBpmn20Xml({
        client,
        path: { id: args.processDefinitionId },
      }),
  })
}
