import type { MCPServer } from "mcp-use/server"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { PrometheusClient } from "@miragon-ai/client-analytics"
import { registerPerformanceTools } from "./performance.js"
import { registerFailureTools } from "./failures.js"
import { registerElementTools } from "./element.js"
import { registerClusterCompareTools } from "./cluster-compare.js"
import { registerVersionCompareTools } from "./version-compare.js"
import { registerEngineCompareTools } from "./engine-compare.js"
import { registerHealthTools } from "./health.js"

export function registerTools(server: MCPServer, client: PrometheusClient): void {
  const register = createToolRegistrar(server, client)
  registerPerformanceTools(register)
  registerFailureTools(register)
  registerElementTools(register)
  registerClusterCompareTools(register)
  registerVersionCompareTools(register)
  registerEngineCompareTools(register)
  registerHealthTools(register)
}
