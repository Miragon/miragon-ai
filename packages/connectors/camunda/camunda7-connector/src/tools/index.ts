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
import { registerBatchTools } from "./batches.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export interface RegisterToolsOptions {
  /**
   * Register `camunda7_create_deployment` (`CAMUNDA_ALLOW_DEPLOYMENTS=true`).
   * Deploying runs code inside the engine JVM, so the tool is opt-in on top
   * of being admin-only. Default: off.
   */
  allowDeployments?: boolean
}

export function registerTools(register: Register, opts: RegisterToolsOptions = {}): void {
  registerProcessDefinitionTools(register)
  registerProcessInstanceTools(register)
  registerTaskTools(register)
  registerTaskFormTools(register)
  registerExternalTaskTools(register)
  registerMessageSignalTools(register)
  registerDeploymentTools(register, { allowDeployments: opts.allowDeployments === true })
  registerIncidentTools(register)
  registerJobTools(register)
  registerHistoryTools(register)
  registerMigrationTools(register)
  registerBatchTools(register)
}
