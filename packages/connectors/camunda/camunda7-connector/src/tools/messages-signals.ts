import { correlateMessageInput, throwSignalInput } from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { deliverMessage, throwSignal } from "@miragon-ai/camunda7-client/sdk"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerMessageSignalTools(register: Register) {
  register({
    name: "camunda7_correlate_message",
    category: "messages-signals",
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
          correlationKeys: args.correlationKeys,
          processVariables: args.processVariables,
          resultEnabled: args.resultEnabled,
        },
      }),
    ),
  })

  register({
    name: "camunda7_throw_signal",
    category: "messages-signals",
    description:
      "Throw a signal — an ENGINE-WIDE broadcast, not a targeted call: it triggers every matching signal catch event " +
      "in every running process instance and starts a new instance through every matching signal start event. " +
      "Cannot be undone or scoped to one instance (use camunda7_correlate_message for targeted delivery).",
    // Engine-wide side effects (admin-only via ADMIN_ONLY_TOOLS).
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...throwSignalInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => {
      await throwSignal({
        client,
        body: {
          name: args.name,
          variables: args.variables,
        },
      })
      return { success: true, signalName: args.name }
    }),
  })
}
