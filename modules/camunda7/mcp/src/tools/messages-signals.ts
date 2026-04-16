import type { Client } from "@miragon-ai/client-camunda7"
import { correlateMessageInput, throwSignalInput } from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { deliverMessage, throwSignal } from "@miragon-ai/client-camunda7/generated/sdk.gen"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerMessageSignalTools(register: Register) {
  register({
    name: "camunda7_correlate_message",
    description:
      "Correlate a message to trigger a message catch event or start a message start event.",
    annotations: { openWorldHint: true },
    inputSchema: correlateMessageInput.shape,
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
    inputSchema: throwSignalInput.shape,
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
