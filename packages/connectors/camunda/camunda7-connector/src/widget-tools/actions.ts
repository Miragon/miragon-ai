import { z } from "zod"
import {
  appOnly,
  buildDataFeedResult as rawData,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { allowedWidgetActions } from "../lib/toolsets.js"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type { WidgetToolsContext } from "./shared.js"

/**
 * The app-only feed behind `useCanRun`: which in-widget engine writes this
 * deployment's toolset registers. Decided once at registration (the toolset is
 * deployment config) by the same rule as the registrar filter, so a widget
 * never renders a button whose click would resolve to an unknown tool.
 */
export function registerWidgetActionsFeed(ctx: WidgetToolsContext) {
  const allowedActions = allowedWidgetActions(ctx.toolset)

  ctx.server.tool(
    {
      name: CAMUNDA7_WIDGET_ACTIONS_DATA,
      title: "Widget actions (internal)",
      description:
        "Internal JSON feed (no UI): which engine write actions the widgets may offer in this deployment.",
      // No engine I/O — the answer is deployment config.
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z.object({}),
      ...appOnly,
    },
    withToolErrors(() => Promise.resolve(rawData({ allowedActions }))),
  )
}
