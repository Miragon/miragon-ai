import type { MCPServer } from "mcp-use"

/**
 * The camunda7 tools this deployment registers FOR THE MODEL — what the
 * widgets' Ask-AI hand-offs and model contexts may name (#338), reported by
 * `camunda7_widget_actions_data` (`actions.ts`). It lives on the widget-tools
 * path because it forwards raw `server.tool()` registrations. Recorded,
 * not re-derived: every registration path of the module (the toolset-filtered
 * registrar, the deployment gate, the widget tools, the profile tools) goes
 * through the server handed out by {@link ModelSurface.record}, so the list
 * IS what `tools/list` advertises — minus the app-only `*_data` feeds, which
 * SEP-1865 hosts hide from the model.
 */
export interface ModelSurface {
  /** A view of `server` whose `tool()` registrations are recorded. */
  record: (server: MCPServer) => MCPServer
  /** The recorded model-visible tool names, sorted. */
  tools: () => string[]
}

type ToolDefinition = Parameters<MCPServer["tool"]>[0]
type ToolCallback = Parameters<MCPServer["tool"]>[1]

function isAppOnly(definition: ToolDefinition): boolean {
  const { visibility } = definition as { visibility?: unknown }
  return visibility === "app" || (Array.isArray(visibility) && !visibility.includes("model"))
}

export function createModelSurface(): ModelSurface {
  const names = new Set<string>()
  return {
    record(server) {
      // A Proxy (not a subclass/spread): every other member is the real
      // server's, bound to it, so mcp-use internals and the toolkit's
      // duplicate-name guard (which replaced `server.tool`) keep working.
      return new Proxy(server, {
        get(target, property) {
          if (property === "tool") {
            return (definition: ToolDefinition, callback: ToolCallback) => {
              const registered = target.tool(definition, callback)
              if (!isAppOnly(definition)) names.add(definition.name)
              return registered
            }
          }
          const value: unknown = Reflect.get(target, property, target)
          return typeof value === "function" ? (value as () => unknown).bind(target) : value
        },
      })
    },
    tools: () => [...names].sort(),
  }
}
