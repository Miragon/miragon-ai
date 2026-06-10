import { z } from "zod"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getSelectedEngine, setSelectedEngine } from "../lib/engine-session.js"
import { UnknownEngineError, type EngineRegistry } from "../lib/resolve-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

/**
 * Registers the consolidated engine-management tool that lets the MCP host
 * discover available engines and pick which one operations tools route to
 * for this session:
 *
 *   - `camunda7_engine` action `"list"`    → list registered engines.
 *   - `camunda7_engine` action `"select"`  → set the sticky engine for this session.
 *   - `camunda7_engine` action `"current"` → report which engine is currently sticky.
 */
export function registerEngineTools(register: Register): void {
  register({
    name: "camunda7_engine",
    category: "engines",
    description:
      "Manage which CIB Seven / Camunda 7 engine this MCP session talks to. " +
      'action="list" returns the configured engines plus the current selection; ' +
      'action="select" (requires engineId) makes that engine the sticky default for all ' +
      "subsequent operations tool calls in this session until selected again; " +
      'action="current" reports the sticky selection (or null). ' +
      "With more than one engine configured, list then select before calling operations tools — " +
      "or pass the per-call `engine` parameter to override the sticky selection for a single call.",
    annotations: { idempotentHint: true },
    inputSchema: {
      action: z
        .enum(["list", "select", "current"])
        .describe("Engine-management action to perform."),
      engineId: z
        .string()
        .optional()
        .describe('Engine id to select (required for action="select"), e.g. "prod-a".'),
    },
    handler: async (reg: EngineRegistry, args) => {
      const action = args.action as "list" | "select" | "current"
      switch (action) {
        case "list":
          return {
            engines: reg.engines.map((e) => ({
              id: e.id,
              baseUrl: e.baseUrl,
              ...(e.cockpitUrl ? { cockpitUrl: e.cockpitUrl } : {}),
            })),
            currentSelection: getSelectedEngine() ?? null,
          }
        case "select": {
          const id = args.engineId ? String(args.engineId) : ""
          if (!id) {
            throw new Error('action="select" requires an engineId (see action="list" for ids)')
          }
          if (!reg.clients.has(id)) {
            throw new UnknownEngineError(id, reg.engines)
          }
          setSelectedEngine(id)
          return { selected: id }
        }
        case "current":
          return { engineId: getSelectedEngine() ?? null }
      }
    },
  })
}
