import type { MCPServer } from "mcp-use/server"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { EngineRegistry } from "../lib/resolve-engine.js"

import { registerProcessDefinitionTools } from "./process-definitions.js"
import { registerProcessInstanceTools } from "./process-instances.js"
import { registerTaskTools } from "./tasks.js"
import { registerTaskFormTools } from "./task-form.js"
import { registerExternalTaskTools } from "./external-tasks.js"
import { registerMessageSignalTools } from "./messages-signals.js"
import { registerDeploymentTools } from "./deployments.js"
import { registerIncidentTools } from "./incidents.js"
import { registerJobTools } from "./jobs.js"
import { registerHistoryTools } from "./history.js"
import { registerMigrationTools } from "./migrations.js"

export function registerTools(server: MCPServer, registry: EngineRegistry): void {
  const register = createToolRegistrar(server, registry)
  registerProcessDefinitionTools(register)
  registerProcessInstanceTools(register)
  registerTaskTools(register)
  registerTaskFormTools(register)
  registerExternalTaskTools(register)
  registerMessageSignalTools(register)
  registerDeploymentTools(register)
  registerIncidentTools(register)
  registerJobTools(register)
  registerHistoryTools(register)
  registerMigrationTools(register)
}
