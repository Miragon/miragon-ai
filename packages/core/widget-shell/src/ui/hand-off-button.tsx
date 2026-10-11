import { useLocale } from "@miragon/mcp-toolkit-ui"
import {
  ArrowLeftRight,
  Braces,
  Bug,
  ClipboardList,
  FileSearch,
  Gauge,
  Hourglass,
  ListChecks,
  ListOrdered,
  Route,
  ScanSearch,
  Stethoscope,
  Timer,
  Workflow,
  Wrench,
} from "lucide-react"
import { AskAiButton, type AskAiVariant } from "./ask-ai-button.js"
import type { AskAiPrompt } from "./ask-ai-prompt.js"
import type { LucideIcon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"

/**
 * The product's ONE hand-off vocabulary: what a hand-off asks the chat to
 * do, one entry per function, each with the Lucide icon of that function.
 * Its label ("Ursache im Chat klären" / "Find cause in chat") is the kit's
 * `handOff` entry, so the same function reads and looks the same in every
 * module, and no icon stands for two functions (CI U4: never a sparkle,
 * never a generic "AI" symbol). A connector widget renders hand-offs only
 * through {@link HandOffButton} (an ESLint gate bans `AskAiButton` there); a
 * new function goes here, with its label in both languages.
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
  explainBottleneck: Hourglass,
  prioritize: ListOrdered,
  compareEngines: ArrowLeftRight,
} as const satisfies Record<string, LucideIcon>

export type HandOffAction = keyof typeof HAND_OFF_ACTIONS

/**
 * A chat hand-off: the kit's {@link AskAiButton} (a secondary outline, so the
 * deterministic next step stays the view's primary action) with the icon and
 * verb of `action`. `icon` variant rows keep the label as the accessible name
 * and tooltip; `title` overrides both when a row needs its subject in them
 * ("Compare “order” across its engines in chat").
 */
export function HandOffButton({
  action,
  prompt,
  variant = "subtle",
  title,
}: {
  action: HandOffAction
  prompt: AskAiPrompt | null
  variant?: AskAiVariant
  title?: string
}) {
  const locale = useLocale()
  return (
    <AskAiButton
      icon={HAND_OFF_ACTIONS[action]}
      label={kitLabels(locale).handOff[action]}
      prompt={prompt}
      variant={variant}
      title={title}
    />
  )
}
