import {
  listProcessDefinitionsInput,
  getProcessDefinitionXmlInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getProcessDefinitions,
  getProcessDefinitionBpmn20Xml,
} from "@miragon-ai/client-cibseven/sdk"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerProcessDefinitionTools(register: Register) {
  register({
    name: "camunda7_list_process_definitions",
    description:
      "List deployed process definitions with optional filters. Returns key, name, version, and deployment info.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listProcessDefinitionsInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
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
    ),
  })

  register({
    name: "camunda7_get_process_definition_xml",
    description:
      "Get the BPMN 2.0 XML of a process definition by ID. Returns the raw BPMN XML string.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getProcessDefinitionXmlInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getProcessDefinitionBpmn20Xml({
        client,
        path: { id: args.processDefinitionId },
      }),
    ),
  })
}
