import { z } from "zod"
import {
  firstResultParam,
  flagParam,
  likeParam,
  maxResultsParam,
  sortOrderParam,
  variableSchema,
  variableValueInfo,
} from "./shared.js"

export const startProcessInstanceInput = z.object({
  processDefinitionKey: z.string().describe("The key of the process definition to start"),
  businessKey: z.string().optional().describe("Business key for correlation"),
  variables: variableSchema.optional(),
})

export const listProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKey: z.string().optional().describe("Filter by exact business key"),
  businessKeyLike: likeParam("Filter by business key"),
  active: flagParam("true = only active instances, false = only suspended"),
  suspended: flagParam("true = only suspended instances, false = only active"),
  withIncidents: flagParam("true = only instances with an open incident"),
  firstResult: firstResultParam,
  maxResults: maxResultsParam(),
  sortBy: z
    .enum(["instanceId", "definitionKey", "definitionId", "tenantId", "businessKey"])
    .optional(),
  sortOrder: sortOrderParam,
})

export const getProcessInstanceInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
})

export const getActivityInstanceTreeInput = z.object({
  processInstanceId: z.string().describe("The process instance ID"),
})

export const deleteProcessInstanceInput = z.object({
  processInstanceId: z.string().describe("The process instance ID to delete"),
  skipSubprocesses: z
    .boolean()
    .optional()
    .describe("Keep the instances its call activities started (default: deleted too)"),
  skipCustomListeners: z
    .boolean()
    .optional()
    .describe("Skip custom execution listeners (e.g. when one fails the delete)"),
  skipIoMappings: z.boolean().optional().describe("Skip input/output mappings"),
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
  value: z.unknown().describe("The value (Json/Object: serialized string or parsed JSON)"),
  type: z
    .string()
    .optional()
    .describe("Variable type (String, Long, Boolean, Date: ISO 8601, Json, Object, …)"),
  valueInfo: variableValueInfo,
})

export const setProcessInstanceSuspensionInput = z.object({
  processInstanceId: z
    .string()
    .describe("The ID of the process instance whose suspension state to change."),
  suspended: z
    .boolean()
    .describe(
      "Target suspension state: `true` suspends the instance (running jobs are frozen), `false` activates (unsuspends) it.",
    ),
})
