import { useMemo } from "react"
import { useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  askAiPrompt,
  modelContextText,
  type AskAiPrompt,
  type HandOffParts,
  type ModelContextSpec,
  type ToolSurface,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsAskAiKey } from "../messages/en.ask-ai.js"
import { translator } from "../messages/index.js"

/** An analytics hand-off: catalogue intent + the typed parts (the surface is added by the hook). */
export interface HandOff extends Omit<HandOffParts, "surface"> {
  intent: AnalyticsAskAiKey
}

/** An analytics view context: static summary + the typed parts. */
export type ViewContext = Omit<ModelContextSpec, "surface">

/**
 * The camunda7 module's surface feed, by raw name — a tier-2 cross-module
 * reference (string, not import; cf. camunda7's `analytics-probe.ts`). It
 * reports the camunda7 tools the deployment registers for the model; when
 * camunda7 is not active the call fails and no camunda7 tool is ever named.
 */
const CAMUNDA7_SURFACE_FEED = "camunda7_widget_actions_data"

/**
 * The tools an analytics widget may name for the model:
 *
 * - `analytics_*` — the module is active (its own widget is rendering), and
 *   every analytics tool a hand-off names is registered by its read-only
 *   floor (pinned by the app's hand-off surface test);
 * - `camunda7_*` — exactly what `camunda7_widget_actions_data` reports, once
 *   it answered (fails closed before, and without the camunda7 module).
 */
export function analyticsSurface(camunda7ModelTools: readonly string[] | undefined): ToolSurface {
  return {
    has: (tool) => tool.startsWith("analytics_") || (camunda7ModelTools?.includes(tool) ?? false),
  }
}

/**
 * The surface a model description can rely on WITHOUT a live query (the
 * adapter's `describeForModel` is a pure function): analytics tools only.
 */
export const ANALYTICS_ONLY_SURFACE = analyticsSurface(undefined)

/** {@link analyticsSurface} over the live camunda7 feed. */
export function useAnalyticsSurface(): ToolSurface {
  const modelTools = useToolQuery<{ modelTools?: string[] }>(
    ["camunda7-widget-actions"],
    CAMUNDA7_SURFACE_FEED,
    {},
  ).data?.modelTools
  return useMemo(() => analyticsSurface(modelTools), [modelTools])
}

/** Pure binding of the builders to a locale and surface (the hook's body; testable without React). */
export function bindHandOff(locale: string, surface: ToolSurface) {
  return {
    surface,
    /** The Ask-AI prompt for `HandOffButton` — null when nothing in it is available here. */
    ask: (handOff: HandOff): AskAiPrompt | null =>
      askAiPrompt({ ...handOff, intent: translator(locale, handOff.intent), locale, surface }),
    /** The `HostModelContext` text for a view. */
    context: (view: ViewContext): string => modelContextText({ ...view, surface }),
  }
}

/**
 * The analytics widgets' ONE way to talk to the model: Ask-AI prompts and
 * model contexts, localized to the active locale and filtered by the live
 * tool surface (CLAUDE.md invariant 6).
 */
export function useHandOff() {
  const surface = useAnalyticsSurface()
  const locale = useLocale()
  return useMemo(() => bindHandOff(locale, surface), [locale, surface])
}

/**
 * The engine scope a hand-off or model context states: the result's `engines`
 * echo — the ids the server resolved from its CONFIGURED set for the data on
 * screen (#336) — as the `engine` id a follow-up call takes: the one id, the
 * aggregated list, or nothing for an unscoped library result. Never a cell
 * prop: the scope named must be the scope of the numbers shown, and an id the
 * server did not resolve is one analytics would refuse.
 */
export function engineIdsOf(
  engines: readonly string[] | null | undefined,
): string | string[] | undefined {
  if (!engines || engines.length === 0) return undefined
  return engines.length === 1 ? engines[0] : [...engines]
}

/** True when the figures add up several engines (the deliberate fleet aggregate). */
export function isAggregate(engines: readonly string[] | null | undefined): boolean {
  return (engines?.length ?? 0) > 1
}
