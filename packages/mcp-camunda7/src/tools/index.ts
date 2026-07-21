import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
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

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerTools(register: Register): void {
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
