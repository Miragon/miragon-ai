import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getSelectedEngine, setSelectedEngine } from "../lib/engine-session.js"
import { UnknownEngineError, type EngineRegistry } from "../lib/resolve-engine.js"

/**
 * Registers the engine-management tools that let the MCP host discover
 * available engines and pick which one operations tools should route to for
 * this session.
 *
 *   - `camunda7_list_engines`     → list registered engines.
 *   - `camunda7_select_engine`    → set the sticky engine for this session.
 *   - `camunda7_current_engine`   → report which engine is currently sticky.
 */
export function registerEngineTools(server: MCPServer, registry: EngineRegistry): void {
  const register = createToolRegistrar(server, registry)

  register({
    name: "camunda7_list_engines",
    description:
      "List the CIB Seven / Camunda 7 engines this MCP server is configured to talk to. Call this first when more than one engine is configured to find a valid engine id to pass to `camunda7_select_engine`.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {},
    handler: async (reg: EngineRegistry) => ({
      engines: reg.engines.map((e) => ({
        id: e.id,
        baseUrl: e.baseUrl,
        ...(e.cockpitUrl ? { cockpitUrl: e.cockpitUrl } : {}),
      })),
      currentSelection: getSelectedEngine() ?? null,
    }),
  })

  register({
    name: "camunda7_select_engine",
    description:
      "Pick the engine to use for subsequent operations tool calls in this MCP session. The selection is sticky until changed via another call to this tool. Use this when more than one engine is configured.",
    annotations: { idempotentHint: true },
    inputSchema: {
      id: z.string().describe('Engine id from `camunda7_list_engines`, e.g. "prod-a"'),
    },
    handler: async (reg, args) => {
      const id = String(args.id)
      if (!reg.clients.has(id)) {
        throw new UnknownEngineError(id, reg.engines)
      }
      setSelectedEngine(id)
      return { selected: id }
    },
  })

  register({
    name: "camunda7_current_engine",
    description:
      "Report which engine is currently selected for this MCP session, or `null` if none is selected yet.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {},
    handler: async () => ({ engineId: getSelectedEngine() ?? null }),
  })
}
