import { Button, useLocale } from "@miragon/mcp-toolkit-ui"
import { MessageSquare } from "lucide-react"
import type { AskAiPrompt } from "./ask-ai-prompt.js"
import { Icon, type LucideIcon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { useHostActions } from "./use-host-actions.js"

/**
 * Placement tiers. All render as the same secondary outline button (a
 * hand-off is never the view's primary action: the deterministic next step,
 * Retry or Resolve, is); `icon` drops the visible label for dense rows.
 */
export type AskAiVariant = "primary" | "subtle" | "icon"

export interface AskAiButtonProps {
  /**
   * The hand-off posted to the agent as the user's chat message (`askAi` →
   * `sendFollowup`). Only {@link askAiPrompt} builds one: a short localized
   * intent + ids, engine text fenced as untrusted data, and only the tools
   * the deployment registers for the model. `null` — nothing in the task is
   * available here (or not yet known) — renders no button at all.
   */
  prompt: AskAiPrompt | null
  /**
   * The Lucide icon of the CONCRETE function the chat will do — `FileSearch`
   * to explain an error, `ClipboardList` to draft a ticket, `GitCompare` to
   * compare (CI: no sparkles, no generic "AI" symbol). Defaults to a neutral
   * `MessageSquare` (it goes to the chat).
   */
  icon?: LucideIcon
  /**
   * A verb phrase that says the work happens in the chat: "Im Chat
   * erklären" / "Explain in chat", "Ticket im Chat entwerfen". Defaults to
   * the locale's "Im Chat analysieren" / "Analyze in chat". For `icon` it
   * moves to `aria-label`/`title`.
   */
  label?: string
  /**
   * `primary` = the one surface-level entry of a view; `subtle` = per-row /
   * per-section (the common case); `icon` = dense table rows (icon only,
   * label → aria-label).
   */
  variant?: AskAiVariant
  /** Tooltip/aria override; defaults to `label`. */
  title?: string
  disabled?: boolean
  /** Optional hook fired after the handoff is dispatched. */
  onSent?: () => void
}

/**
 * The single "cross into chat" affordance for the whole cockpit and the ONLY
 * owner of the {@link useHostActions} `askAi` call site (a structural test
 * fails on any other) for analyze / explain / compare / draft / prepare-action
 * handoffs. Renders the same everywhere: an outline button with the icon of
 * the concrete function and a verb that names the chat. Deterministic
 * navigation (`useNav`/`showWidget`) and mutations must NOT use this — they
 * keep their own controls.
 */
export function AskAiButton({
  prompt,
  icon = MessageSquare,
  label,
  variant = "subtle",
  title,
  disabled,
  onSent,
}: AskAiButtonProps) {
  const host = useHostActions()
  const locale = useLocale()
  if (prompt === null) return null
  // The kit has no message catalog of its own, so the default verb follows the
  // ambient locale — otherwise every label-less call site leaks English into a
  // localized cockpit.
  const effectiveLabel = label ?? kitLabels(locale).askAiDefault
  const isIcon = variant === "icon"
  return (
    <Button
      type="button"
      variant="outline"
      size={isIcon ? "icon-sm" : "sm"}
      disabled={disabled}
      aria-label={isIcon ? (title ?? effectiveLabel) : undefined}
      title={isIcon ? (title ?? effectiveLabel) : title}
      onClick={() => {
        host.askAi(prompt)
        onSent?.()
      }}
    >
      <Icon icon={icon} dense={isIcon} />
      {!isIcon && effectiveLabel}
    </Button>
  )
}
