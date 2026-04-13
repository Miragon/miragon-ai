import type { MCPServer } from "mcp-use/server"
import { createToolRegistrar } from "@automation-mcp/core"
import type { ClickHouseClient } from "../client.js"
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
