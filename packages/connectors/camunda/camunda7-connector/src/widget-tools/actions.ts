import {
  appOnly,
  buildDataFeedResult as rawData,
  withToolErrors,
  strictToolInput,
} from "@miragon-ai/widget-shell/server"
import { allowedWidgetActions } from "../lib/toolsets.js"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type { WidgetToolsContext } from "./shared.js"

/**
 * The app-only feed behind `useCanRun` and the hand-off surface:
 *
 * - `allowedActions` — which in-widget engine writes this deployment's
 *   toolset registers. Decided once at registration (the toolset is
 *   deployment config) by the same rule as the registrar filter, so a widget
 *   never renders a button whose click would resolve to an unknown tool.
 * - `modelTools` — every camunda7 tool the deployment registers for the
 *   MODEL (app-only feeds excluded), as recorded at registration. Ask-AI
 *   hand-offs and model contexts name only these (#338), so a prompt never
 *   sends the model to a tool its toolset withholds or a host hides.
 */
export function registerWidgetActionsFeed(ctx: WidgetToolsContext) {
  const allowedActions = allowedWidgetActions(ctx.toolset)

  ctx.server.tool(
    {
      name: CAMUNDA7_WIDGET_ACTIONS_DATA,
      title: "Widget actions (internal)",
      description:
        "Internal JSON feed (no UI): which engine write actions the widgets may offer and which tools the model has in this deployment.",
      // No engine I/O — the answer is deployment config.
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: strictToolInput({}),
      ...appOnly,
    },
    // `modelTools` is read per call: the registrations after this one (the
    // profile tools) belong to the surface too.
    withToolErrors(() =>
      Promise.resolve(rawData({ allowedActions, modelTools: ctx.modelTools() })),
    ),
  )
}
