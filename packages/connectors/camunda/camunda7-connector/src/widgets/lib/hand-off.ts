import { useMemo } from "react"
import { useLocale } from "@miragon/mcp-toolkit-ui"
import {
  askAiPrompt,
  modelContextText,
  type AskAiPrompt,
  type HandOffParts,
  type ModelContextSpec,
  type ToolSurface,
} from "@miragon-ai/widget-shell/widgets"
import type { Camunda7AskAiKey } from "../../messages/en.ask-ai.js"
import { translator } from "../../messages/index.js"
import { useWidgetActionsFeed } from "../widget-actions.js"
import { useAnalyticsActive } from "../cockpit-app/analytics-probe.js"

/** An Ask-AI intent: a static catalogue text (labels excluded). */
export type Camunda7AskAiIntent = Exclude<Camunda7AskAiKey, `${string}Label`>

/** A camunda7 hand-off: catalogue intent + the typed parts (the surface is added by the hook). */
export interface HandOff extends Omit<HandOffParts, "surface"> {
  intent: Camunda7AskAiIntent
}

/** A camunda7 model context: static summary + the typed parts. */
export type ViewContext = Omit<ModelContextSpec, "surface">

/**
 * The tools a camunda7 widget may name for the model:
 *
 * - `camunda7_*` — exactly the module's model-visible tools in THIS
 *   deployment (`modelTools` of `camunda7_widget_actions_data`, recorded at
 *   registration), so a read-only or operations deployment never hears of an
 *   admin-only write and no prompt names an app-only feed;
 * - `analytics_*` — the analytics module's tools once its probe confirms it
 *   is active (hand-offs name only analytics tools its read-only floor
 *   registers — pinned by the app's hand-off surface test);
 * - anything else — never.
 *
 * Fails closed: until the feeds answer nothing is confirmed, so a hand-off
 * that needs a tool appears a moment late instead of naming one that is gone.
 */
export function camunda7Surface(
  modelTools: readonly string[] | undefined,
  analyticsActive: boolean,
): ToolSurface {
  return {
    has: (tool) =>
      tool.startsWith("analytics_") ? analyticsActive : (modelTools?.includes(tool) ?? false),
  }
}

/** {@link camunda7Surface} over the live feeds. */
export function useCamunda7Surface(): ToolSurface {
  const modelTools = useWidgetActionsFeed()?.modelTools
  const analytics = useAnalyticsActive()
  return useMemo(() => camunda7Surface(modelTools, analytics), [modelTools, analytics])
}

/** Pure binding of the builders to a locale and surface (the hook's body; testable without React). */
export function bindHandOff(locale: string, surface: ToolSurface) {
  return {
    surface,
    /** The Ask-AI prompt for `AskAiButton` — null when nothing in it is available here. */
    ask: (handOff: HandOff): AskAiPrompt | null =>
      askAiPrompt({ ...handOff, intent: translator(locale, handOff.intent), locale, surface }),
    /** The `HostModelContext` text for a view. */
    context: (view: ViewContext): string => modelContextText({ ...view, surface }),
  }
}

/**
 * The camunda7 widgets' ONE way to talk to the model: Ask-AI prompts and
 * model contexts, localized to the active locale and filtered by the live
 * tool surface (CLAUDE.md invariant 6).
 */
export function useHandOff() {
  const surface = useCamunda7Surface()
  const locale = useLocale()
  return useMemo(() => bindHandOff(locale, surface), [locale, surface])
}
