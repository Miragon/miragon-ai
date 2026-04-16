import type { MCPServer } from "mcp-use/server"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { ClickHouseClient } from "@miragon-ai/client-analytics"
import { registerSearchTools } from "./search.js"
import { registerPerformanceTools } from "./performance.js"
import { registerFailureTools } from "./failures.js"
import { registerTraceTools } from "./trace.js"

export function registerTools(server: MCPServer, client: ClickHouseClient): void {
  const register = createToolRegistrar(server, client)
  registerSearchTools(register)
  registerPerformanceTools(register)
  registerFailureTools(register)
  registerTraceTools(register)
}
