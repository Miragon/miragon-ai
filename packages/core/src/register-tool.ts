import { type MCPServer, text, error } from "mcp-use/server"
import { z } from "zod"

type ZodRawShape = Record<string, z.ZodTypeAny>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK provides args as Record<string, any> after zod validation
type ToolArgs = Record<string, any>

export interface ToolConfig<TClient> {
  name: string
  description: string
  category?: string
  inputSchema?: ZodRawShape
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  handler: (client: TClient, args: ToolArgs) => Promise<unknown>
  formatResult?: (result: unknown, args: ToolArgs) => string
}

export interface RegisteredToolMeta {
  name: string
  category?: string
}

export function createToolRegistrar<TClient>(server: MCPServer, client: TClient) {
  const registeredTools: RegisteredToolMeta[] = []

  function register(config: ToolConfig<TClient>) {
    registeredTools.push({ name: config.name, category: config.category })
    server.tool(
      {
        name: config.name,
        description: config.description,
        schema: config.inputSchema ? z.object(config.inputSchema) : undefined,
        annotations: config.annotations,
      },
      async (args) => {
        try {
          const result = await config.handler(client, args)
          if (config.formatResult) {
            return text(config.formatResult(result, args))
          }
          if (result !== null && result !== undefined) {
            return text(JSON.stringify(result, null, 2))
          }
          return text("Success (no content returned)")
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          const code = (e as { status?: number }).status ?? (e as { code?: string }).code
          return error(code ? `[${code}] ${message}` : message)
        }
      },
    )
  }

  register.getRegisteredTools = () => registeredTools

  return register
}
