import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import { CAMUNDA7_WIDGET_ACTIONS_DATA, type Camunda7WidgetAction } from "../tool-names.js"

interface WidgetActionsFeed {
  allowedActions?: string[]
}

/**
 * Which in-widget engine writes this deployment exposes — `camunda7:read-only`
 * none, `:operations` all but the admin-only suspend/cancel. A button whose
 * tool is not allowed is not rendered at all: the toolset is deployment-wide,
 * so a disabled control would only raise a question the user cannot act on.
 *
 * Fails closed: until the feed answers (or when it errors) nothing is allowed,
 * so a button may appear a moment late but never vanishes under the cursor.
 * The key sits outside the `camunda7:` prefix on purpose — the answer is
 * deployment config, and `refreshCockpitData` refetches that namespace after
 * every mutation.
 */
export function useCanRun(): (action: Camunda7WidgetAction) => boolean {
  const { data } = useToolQuery<WidgetActionsFeed>(
    ["camunda7-widget-actions"],
    CAMUNDA7_WIDGET_ACTIONS_DATA,
    {},
  )
  const allowed = data?.allowedActions
  return (action) => allowed?.includes(action) ?? false
}
