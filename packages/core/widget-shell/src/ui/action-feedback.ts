import { useMemo } from "react"
import { useLocale, useToast } from "@miragon/mcp-toolkit-ui"
import { describeError } from "./describe-error.js"

/** What a write says when it is done — the toolkit's toasts, never a silent row change. */
export interface ActionFeedback {
  /**
   * The write worked: a success toast whose title names the object
   * ("Job für LEA-2026-00424 neu eingeplant", "Einstellungen gespeichert").
   */
  succeeded: (title: string, description?: string) => void
  /**
   * The write failed: a danger toast (5 s) whose title names the object
   * ("Job für LEA-2026-00424 konnte nicht neu eingeplant werden") and whose
   * second line says why and what you can do ({@link describeError}), never
   * the raw engine text.
   */
  failed: (title: string, error: unknown) => void
}

/** The toast's second line for a failed write: the reason in words, then the next step. */
export function failureLine(error: unknown, locale: string | undefined): string {
  const described = describeError(error, locale)
  return described.kind === "unknown" ? described.hint : `${described.title}. ${described.hint}`
}

/**
 * Feedback for a write (CI §9: success and failure each a toast, never only
 * a console line). The toasts are the toolkit's (`McpAppView` mounts their
 * provider, a polite live region bottom centre): announced to screen readers,
 * held while hovered or focused. Outside a provider (a bare fixture) the
 * calls are no-ops.
 */
export function useActionFeedback(): ActionFeedback {
  const toast = useToast()
  const locale = useLocale()
  return useMemo(
    () => ({
      succeeded: (title, description) => {
        toast.show({ tone: "success", title, ...(description ? { description } : {}) })
      },
      failed: (title, error) => {
        toast.show({ tone: "danger", title, description: failureLine(error, locale) })
      },
    }),
    [toast, locale],
  )
}
