import { z } from "zod"
import type { Client } from "@automation-mcp/client-camunda7"
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
    inputSchema: {
      key: z.string().optional().describe("Filter by exact process definition key"),
      nameLike: z.string().optional().describe("Filter by name (substring match)"),
      latestVersion: z.boolean().optional().describe("Only return latest versions"),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .default(20)
        .describe("Maximum number of results"),
      sortBy: z
        .enum(["category", "key", "id", "name", "version", "deploymentId", "tenantId"])
        .optional()
        .describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    },
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
    inputSchema: {
      processDefinitionId: z.string().describe("The ID of the process definition"),
    },
    handler: async (client, args) =>
      getProcessDefinitionBpmn20Xml({
        client,
        path: { id: args.processDefinitionId },
      }),
  })
}
