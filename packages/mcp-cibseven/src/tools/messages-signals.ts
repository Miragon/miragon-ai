import { correlateMessageInput, throwSignalInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { deliverMessage, throwSignal } from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerMessageSignalTools(register: Register) {
  register({
    name: "camunda7_correlate_message",
    description:
      "Correlate a message to trigger a message catch event or start a message start event.",
    annotations: { openWorldHint: true },
    inputSchema: { ...correlateMessageInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
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
    ),
  })

  register({
    name: "camunda7_throw_signal",
    description:
      "Throw a signal to trigger all matching signal catch events and signal start events.",
    annotations: { openWorldHint: true },
    inputSchema: { ...throwSignalInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
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
    }),
  })
}
