import { Button } from "@miragon/mcp-toolkit-ui"
import { useHostActions } from "./use-host-actions.js"

/** Visual emphasis tiers — all render the SAME ✦ AI signature, only size/weight differ. */
export type AskAiVariant = "primary" | "subtle" | "icon"

export interface AskAiButtonProps {
  /**
   * The self-contained natural-language task handed to the agent via the host
   * follow-up (`askAi` → `sendFollowUpMessage`). MUST inline every id/key it
   * needs (engine, processDefinitionKey, incidentId, …) — never rely on ambient
   * ModelContext alone.
   */
  prompt: string
  /**
   * Button text. Default `"Analyze"` — the ✦ glyph already signals the AI
   * handoff, so the primary entry needs no "…with AI" suffix. Override only for
   * a different verb (`"Explain this error"`, `"Draft incident ticket"`,
   * `"Prepare migration"`). For `icon` it moves to `aria-label`/`title`.
   */
  label?: string
  /**
   * `primary` = the surface-level entry (outline, slightly prominent);
   * `subtle` = per-row / per-section (ghost, the common case);
   * `icon` = dense table rows (renders ✦ only, label → aria-label).
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
 * The single "cross into chat" affordance for the whole cockpit. Renders
 * identically everywhere (✦ + label, shadcn ghost/outline) and is the only
 * owner of the {@link useHostActions} `askAi` call site for analyze / explain /
 * compare / draft / prepare-action handoffs. Deterministic navigation
 * (`useNav`/`showWidget`) and mutations must NOT use this — they keep their own
 * neutral controls, and never the ✦ glyph or the word "Analyze".
 */
export function AskAiButton({
  prompt,
  label = "Analyze",
  variant = "subtle",
  title,
  disabled,
  onSent,
}: AskAiButtonProps) {
  const host = useHostActions()
  const isIcon = variant === "icon"
  return (
    <Button
      type="button"
      variant={variant === "primary" ? "outline" : "ghost"}
      size={isIcon ? "icon-sm" : "sm"}
      disabled={disabled}
      aria-label={isIcon ? (title ?? label) : undefined}
      title={isIcon ? (title ?? label) : title}
      onClick={() => {
        host.askAi(prompt)
        onSent?.()
      }}
    >
      <span aria-hidden>{AI_GLYPH}</span>
      {!isIcon && label}
    </Button>
  )
}
