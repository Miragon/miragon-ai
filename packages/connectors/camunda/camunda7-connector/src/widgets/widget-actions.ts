import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import { CAMUNDA7_WIDGET_ACTIONS_DATA, type Camunda7WidgetAction } from "../tool-names.js"

export interface WidgetActionsFeed {
  /** The in-widget engine writes this deployment registers. */
  allowedActions?: string[]
  /** Every camunda7 tool this deployment registers for the model (#338). */
  modelTools?: string[]
}

/**
 * The `camunda7_widget_actions_data` query. The key sits outside the
 * `camunda7:` prefix on purpose — the answer is deployment config, and the
 * cockpit's Refresh (`refreshCockpitData`) re-reads that namespace.
 */
function useWidgetActionsQuery() {
  return useToolQuery<WidgetActionsFeed>(
    ["camunda7-widget-actions"],
    CAMUNDA7_WIDGET_ACTIONS_DATA,
    {},
  )
}

/** The deployment's `camunda7_widget_actions_data` answer — undefined until it arrives (or when it errors). */
export function useWidgetActionsFeed(): WidgetActionsFeed | undefined {
  return useWidgetActionsQuery().data
}

/**
 * The camunda7 model tools as far as a widget can know them: the feed's list
 * once it answered; `"pending"` while the call is in flight; `"unknown"` when
 * no answer will come — the call failed, or the host wires no in-widget
 * tools/call, so the query never runs (idle without data).
 */
export type ModelToolsAnswer = readonly string[] | "pending" | "unknown"

/** {@link ModelToolsAnswer} from the query's state (pure — the hook's body). */
export function modelToolsAnswer(query: {
  data?: WidgetActionsFeed
  isError: boolean
  fetchStatus: string
}): ModelToolsAnswer {
  if (query.data?.modelTools) return query.data.modelTools
  if (query.isError || query.fetchStatus === "idle") return "unknown"
  return "pending"
}

/** {@link modelToolsAnswer} over the live feed. */
export function useModelToolsAnswer(): ModelToolsAnswer {
  return modelToolsAnswer(useWidgetActionsQuery())
}

/**
 * Which in-widget engine writes this deployment exposes — `camunda7:read-only`
 * none, `:operations` all but the admin-only suspend/cancel. A button whose
 * tool is not allowed is not rendered at all: the toolset is deployment-wide,
 * so a disabled control would only raise a question the user cannot act on.
 *
 * Fails closed: until the feed answers (or when it errors) nothing is allowed,
 * so a button may appear a moment late but never vanishes under the cursor.
 * Widgets read the gate through `useEngineAction` (its `allowed`), never
 * directly — the write and its gate travel together.
 */
export function useCanRun(): (action: Camunda7WidgetAction) => boolean {
  const allowed = useWidgetActionsFeed()?.allowedActions
  return (action) => allowed?.includes(action) ?? false
}
