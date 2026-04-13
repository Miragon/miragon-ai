import type { MCPServer } from "mcp-use/server"
import type { Client } from "@automation-mcp/client-camunda7"
import { createToolRegistrar } from "@automation-mcp/core"

import { registerProcessDefinitionTools } from "./process-definitions.js"
import { registerProcessInstanceTools } from "./process-instances.js"
import { registerTaskTools } from "./tasks.js"
import { registerExternalTaskTools } from "./external-tasks.js"
import { registerMessageSignalTools } from "./messages-signals.js"
import { registerDeploymentTools } from "./deployments.js"
import { registerIncidentTools } from "./incidents.js"
import { registerJobTools } from "./jobs.js"
import { registerHistoryTools } from "./history.js"

export function registerTools(server: MCPServer, client: Client): void {
  const register = createToolRegistrar(server, client)
  registerProcessDefinitionTools(register)
  registerProcessInstanceTools(register)
  registerTaskTools(register)
  registerExternalTaskTools(register)
  registerMessageSignalTools(register)
  registerDeploymentTools(register)
  registerIncidentTools(register)
  registerJobTools(register)
  registerHistoryTools(register)
}
