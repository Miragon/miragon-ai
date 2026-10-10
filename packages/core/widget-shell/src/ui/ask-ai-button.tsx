import { Button, useLocale } from "@miragon/mcp-toolkit-ui"
import type { AskAiPrompt } from "./ask-ai-prompt.js"
import { useHostActions } from "./use-host-actions.js"

/** Visual emphasis tiers — all render the SAME ✦ AI signature, only size/weight differ. */
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
   * Button text. Defaults to a locale-aware "Analyze"/"Analysieren" — the ✦
   * glyph already signals the AI handoff, so the primary entry needs no
   * "…with AI" suffix. Override only for a different verb (`"Explain this
   * error"`, `"Draft incident ticket"`, `"Prepare migration"`). For `icon` it
   * moves to `aria-label`/`title`.
   */
  label?: string
  /**
   * Every variant renders as a real (outline) button — the ✦ glyph + frame is the
   * consistent "AI" signature. They differ only in emphasis/size:
   * `primary` = the one surface-level entry (m-blue accent, AI-first);
   * `subtle` = per-row / per-section (neutral outline, the common case);
   * `icon` = dense table rows (neutral outline, ✦ only, label → aria-label).
   */
  variant?: AskAiVariant
  /** Tooltip/aria override; defaults to `label`. */
  title?: string
  disabled?: boolean
  /** Optional hook fired after the handoff is dispatched. */
  onSent?: () => void
}

const AI_GLYPH = "✦"

/**
 * The single "cross into chat" affordance for the whole cockpit and the ONLY
 * owner of the {@link useHostActions} `askAi` call site (a structural test
 * fails on any other) for analyze / explain / compare / draft / prepare-action
 * handoffs. Renders identically everywhere (✦ + label, shadcn outline).
 * Deterministic navigation (`useNav`/`showWidget`) and mutations must NOT use
 * this — they keep their own neutral controls, and never the ✦ glyph or the
 * word "Analyze".
 */
export function AskAiButton({
  prompt,
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
  const effectiveLabel = label ?? (locale.startsWith("de") ? "Analysieren" : "Analyze")
  const isIcon = variant === "icon"
  return (
    <Button
      type="button"
      variant="outline"
      size={isIcon ? "icon-sm" : "sm"}
      // Always a real outline button (frame) so the ✦ never reads as a bare glyph;
      // the primary surface entry gets the m-blue accent to stand out as AI-first.
      className={variant === "primary" ? "border-m-blue/40 text-m-blue" : undefined}
      disabled={disabled}
      aria-label={isIcon ? (title ?? effectiveLabel) : undefined}
      title={isIcon ? (title ?? effectiveLabel) : title}
      onClick={() => {
        host.askAi(prompt)
        onSent?.()
      }}
    >
      <span aria-hidden>{AI_GLYPH}</span>
      {!isIcon && effectiveLabel}
    </Button>
  )
}
