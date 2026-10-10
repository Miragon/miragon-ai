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
import { useModelToolsAnswer, type ModelToolsAnswer } from "../widget-actions.js"
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
 * A process definition key a hand-off may pass as a SCOPE, given the
 * definition id it was parsed from. The engine stores a bare generated id
 * when `<key>:<version>:<id>` would exceed 64 characters (any key over ~25
 * characters with UUID ids — `data/definition-info.ts`), and the parsed "key"
 * is then that id itself: no key filter matches it, so a scoped call would
 * report the incident as isolated. Such a key is undefined — the caller
 * scopes by the exact definition id instead.
 */
export function scopingDefinitionKey(
  key: string | null | undefined,
  definitionId: string | null | undefined,
): string | undefined {
  return key && key !== definitionId ? key : undefined
}

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
 * Fails closed while the feeds are in flight: a hand-off that needs a tool
 * appears a moment late instead of naming one that is gone. When the
 * camunda7 feed cannot answer (`"unknown"`: the call failed, or the host has
 * no in-widget tools/call) its tools are `undefined` — the hand-off is still
 * built, without naming them, since the host can still post it. A failed
 * analytics probe means the module is absent (the probe's whole job).
 */
export function camunda7Surface(
  modelTools: ModelToolsAnswer,
  analyticsActive: boolean,
): ToolSurface {
  return {
    has: (tool) => {
      if (tool.startsWith("analytics_")) return analyticsActive
      if (modelTools === "unknown") return tool.startsWith("camunda7_") ? undefined : false
      return modelTools !== "pending" && modelTools.includes(tool)
    },
  }
}

/** {@link camunda7Surface} over the live feeds. */
export function useCamunda7Surface(): ToolSurface {
  const modelTools = useModelToolsAnswer()
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
