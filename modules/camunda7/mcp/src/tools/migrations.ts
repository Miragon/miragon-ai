import type { Client } from "@miragon-ai/client-camunda7"
import {
  createMigrationPlanInput,
  migrateProcessInstancesAsyncInput,
} from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  generateMigrationPlan,
  executeMigrationPlanAsync,
} from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerMigrationTools(register: Register) {
  register({
    name: "camunda7_create_migration_plan",
    description:
      "Generate a migration plan from a source process definition to a target process definition. The plan contains activity-id mappings for activities that exist in both versions; pass it verbatim to camunda7_migrate_process_instances_async.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: createMigrationPlanInput.shape,
    handler: async (client, args) =>
      generateMigrationPlan({
        client,
        body: {
          sourceProcessDefinitionId: args.sourceProcessDefinitionId,
          targetProcessDefinitionId: args.targetProcessDefinitionId,
          updateEventTriggers: args.updateEventTriggers,
        },
      }),
  })

  register({
    name: "camunda7_migrate_process_instances_async",
    description:
      "Execute a migration plan asynchronously (as a batch) over multiple process instances. Returns the batch id; per-instance progress and failures are tracked on the batch.",
    annotations: { openWorldHint: true },
    inputSchema: migrateProcessInstancesAsyncInput.shape,
    handler: async (client, args) => {
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
    },
  })
}
