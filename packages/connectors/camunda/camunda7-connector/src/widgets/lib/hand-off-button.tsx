import {
  AskAiButton,
  type AskAiPrompt,
  type AskAiVariant,
  type LucideIcon,
} from "@miragon-ai/widget-shell/widgets"
import {
  Braces,
  Bug,
  ClipboardList,
  FileSearch,
  Gauge,
  ListChecks,
  Route,
  ScanSearch,
  Stethoscope,
  Timer,
  Workflow,
  Wrench,
} from "lucide-react"
import { useT } from "../../messages/use-t.js"

/**
 * What a hand-off asks the chat to do — one entry per function, each with
 * the Lucide icon of that function and a label that says the work happens
 * in the chat (`handOff.*`, GLOSSARY.md "Übergaben an den Chat"). The CI's
 * AI affordance: never a sparkle, never a generic "AI" symbol.
 */
export const HAND_OFF_ACTIONS = {
  assess: ListChecks,
  findCause: ScanSearch,
  explainError: FileSearch,
  planFix: Wrench,
  draftTicket: ClipboardList,
  explainTimeline: Route,
  explainDuration: Timer,
  checkVariables: Braces,
  explainDiagram: Workflow,
  checkHealth: Stethoscope,
  analyzeFailures: Bug,
  analyzePerformance: Gauge,
} as const satisfies Record<string, LucideIcon>

export type HandOffAction = keyof typeof HAND_OFF_ACTIONS

/**
 * The camunda7 widgets' chat hand-off: the kit's {@link AskAiButton} (a
 * secondary outline, so the deterministic next step stays the view's
 * primary action) with the icon and verb of `action`. `icon` variant rows
 * keep the label as the accessible name and tooltip.
 */
export function HandOffButton({
  action,
  prompt,
  variant = "subtle",
}: {
  action: HandOffAction
  prompt: AskAiPrompt | null
  variant?: AskAiVariant
}) {
  const t = useT()
  return (
    <AskAiButton
      icon={HAND_OFF_ACTIONS[action]}
      label={t(`handOff.${action}`)}
      prompt={prompt}
      variant={variant}
    />
  )
}
