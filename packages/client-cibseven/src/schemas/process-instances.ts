import { z } from "zod"
import { firstResultParam, variableSchema } from "./shared.js"

export const startProcessInstanceInput = z.object({
  processDefinitionKey: z.string().describe("The key of the process definition to start"),
  businessKey: z.string().optional().describe("Business key for correlation"),
  variables: variableSchema.optional(),
})

export const listProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKey: z.string().optional().describe("Filter by business key"),
  active: z.boolean().optional().describe("Only active instances"),
  suspended: z.boolean().optional().describe("Only suspended instances"),
  firstResult: firstResultParam,
  maxResults: z.number().int().positive().optional().default(20).describe("Maximum results"),
  sortBy: z
    .enum(["instanceId", "definitionKey", "definitionId", "tenantId", "businessKey"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
})

export const getProcessInstanceInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
})

export const getActivityInstanceTreeInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
})

export const deleteProcessInstanceInput = z.object({
  processInstanceId: z.string().describe("The process instance ID to delete"),
})

export const modifyProcessInstanceInput = z.object({
  processInstanceId: z.string().describe("The ID of the process instance to modify"),
  skipCustomListeners: z.boolean().optional().describe("Skip execution of custom listeners"),
  skipIoMappings: z.boolean().optional().describe("Skip execution of input/output mappings"),
  instructions: z
    .array(
      z.object({
        type: z
          .enum(["cancel", "startBeforeActivity", "startAfterActivity", "startTransition"])
          .describe("Instruction type"),
        activityId: z.string().optional().describe("Activity ID to start before/after or cancel"),
        transitionId: z.string().optional().describe("Transition ID for startTransition"),
        activityInstanceId: z.string().optional().describe("Activity instance ID to cancel"),
        transitionInstanceId: z.string().optional().describe("Transition instance ID to cancel"),
        ancestorActivityInstanceId: z.string().optional().describe("Ancestor activity instance ID"),
      }),
    )
    .describe("Modification instructions"),
})

export const getProcessInstanceVariablesInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
})

export const setProcessInstanceVariableInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
  variableName: z.string().describe("The variable name"),
  value: z.unknown().describe("The variable value"),
  type: z.string().optional().describe("The variable type (String, Integer, Boolean, etc.)"),
})

export const suspendProcessInstanceInput = z.object({
  processInstanceId: z
    .string()
    .describe(
      "The ID of the process instance to suspend. Running jobs are frozen until activated.",
    ),
})

export const activateProcessInstanceInput = z.object({
  processInstanceId: z
    .string()
    .describe("The ID of the process instance to activate (i.e. unsuspend)."),
})
