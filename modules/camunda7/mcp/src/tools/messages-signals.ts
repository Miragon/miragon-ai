import { z } from "zod"
import type { Client } from "@miragon-ai/client-camunda7"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { deliverMessage, throwSignal } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

const variableSchema = z
  .record(
    z.string(),
    z.object({
      value: z.unknown(),
      type: z.string().optional(),
    }),
  )
  .describe("Variables map")

export function registerMessageSignalTools(register: Register) {
  register({
    name: "camunda7_correlate_message",
    description:
      "Correlate a message to trigger a message catch event or start a message start event.",
    annotations: { openWorldHint: true },
    inputSchema: {
      messageName: z.string().describe("The name of the message"),
      businessKey: z.string().optional().describe("Business key to correlate with"),
      correlationKeys: variableSchema.optional().describe("Correlation keys to match"),
      processVariables: variableSchema.optional().describe("Variables to set on the process"),
      resultEnabled: z.boolean().optional().default(true).describe("Return correlation result"),
    },
    handler: async (client, args) =>
      deliverMessage({
        client,
        body: {
          messageName: args.messageName,
          businessKey: args.businessKey,
          correlationKeys: args.correlationKeys as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
          processVariables: args.processVariables as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
          resultEnabled: args.resultEnabled,
        },
      }),
  })

  register({
    name: "camunda7_throw_signal",
    description:
      "Throw a signal to trigger all matching signal catch events and signal start events.",
    annotations: { openWorldHint: true },
    inputSchema: {
      name: z.string().describe("The name of the signal"),
      variables: variableSchema.optional().describe("Variables to set"),
    },
    handler: async (client, args) => {
      await throwSignal({
        client,
        body: {
          name: args.name,
          variables: args.variables as
            | Record<string, { value: unknown; type?: string }>
            | undefined,
        },
      })
      return { success: true, signalName: args.name }
    },
  })
}
