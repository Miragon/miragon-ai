import { z } from "zod"

const migrationInstruction = z.object({
  sourceActivityIds: z
    .array(z.string())
    .describe("Activity ids from the source process definition being mapped."),
  targetActivityIds: z
    .array(z.string())
    .describe("Activity ids from the target process definition being mapped."),
  updateEventTrigger: z
    .boolean()
    .optional()
    .describe("Whether event triggers on these activities should be updated during migration."),
})

export const createMigrationPlanInput = z.object({
  sourceProcessDefinitionId: z
    .string()
    .describe("Source process definition id (the version the instances currently run on)."),
  targetProcessDefinitionId: z
    .string()
    .describe("Target process definition id (the version to migrate to)."),
  updateEventTriggers: z
    .boolean()
    .optional()
    .describe("If true, instructions between events are configured to update the event triggers."),
})

export const migrateProcessInstancesAsyncInput = z.object({
  sourceProcessDefinitionId: z.string().describe("Source process definition id."),
  targetProcessDefinitionId: z.string().describe("Target process definition id."),
  processInstanceIds: z
    .array(z.string())
    .min(1)
    .describe("IDs of the process instances to migrate."),
  instructions: z
    .array(migrationInstruction)
    .optional()
    .describe(
      "Explicit activity mappings. Omit to let the engine derive them from equal activity ids between source and target.",
    ),
  skipCustomListeners: z
    .boolean()
    .optional()
    .describe("Skip execution listeners during migration."),
  skipIoMappings: z.boolean().optional().describe("Skip input/output mappings during migration."),
})
