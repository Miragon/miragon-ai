import { z } from "zod"
import { variableSchema } from "./shared.js"

export const correlateMessageInput = z.object({
  messageName: z.string().describe("The name of the message"),
  processInstanceId: z.string().optional().describe("Correlate only to this process instance"),
  businessKey: z.string().optional().describe("Business key to correlate with"),
  correlationKeys: variableSchema.optional().describe("Correlation keys to match"),
  processVariables: variableSchema.optional().describe("Variables to set on the process"),
  all: z.boolean().optional().describe("Correlate to every match (default: exactly one)"),
  resultEnabled: z.boolean().optional().default(true).describe("Return correlation result"),
})

export const throwSignalInput = z.object({
  name: z.string().describe("The name of the signal"),
  variables: variableSchema.optional().describe("Variables to set"),
})
