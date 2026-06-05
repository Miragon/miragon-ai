import {
  createMigrationPlanInput,
  migrateProcessInstancesAsyncInput,
} from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  generateMigrationPlan,
  executeMigrationPlanAsync,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerMigrationTools(register: Register) {
  register({
    name: "camunda7_create_migration_plan",
    description:
      "Generate a migration plan from a source process definition to a target process definition. The plan contains activity-id mappings for activities that exist in both versions; pass it verbatim to camunda7_migrate_process_instances_async.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...createMigrationPlanInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      generateMigrationPlan({
        client,
        body: {
          sourceProcessDefinitionId: args.sourceProcessDefinitionId,
          targetProcessDefinitionId: args.targetProcessDefinitionId,
          updateEventTriggers: args.updateEventTriggers,
        },
      }),
    ),
  })

  register({
    name: "camunda7_migrate_process_instances_async",
    description:
      "Execute a migration plan asynchronously (as a batch) over multiple process instances. Returns the batch id; per-instance progress and failures are tracked on the batch.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...migrateProcessInstancesAsyncInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      const batch = await executeMigrationPlanAsync({
        client,
        body: {
          migrationPlan: {
            sourceProcessDefinitionId: args.sourceProcessDefinitionId,
            targetProcessDefinitionId: args.targetProcessDefinitionId,
            instructions: args.instructions,
          },
          processInstanceIds: args.processInstanceIds,
          skipCustomListeners: args.skipCustomListeners,
          skipIoMappings: args.skipIoMappings,
        },
      })
      return {
        success: true,
        instanceCount: args.processInstanceIds.length,
        batch,
      }
    }),
  })
}
