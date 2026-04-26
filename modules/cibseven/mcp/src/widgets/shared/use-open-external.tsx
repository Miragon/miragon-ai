import { useCallback, useEffect, useRef, useState } from "react"

export type ToastVariant = "copied" | "manual"

interface ToastState {
  url: string
  variant: ToastVariant
}

export interface OpenExternalApi {
  toast: ToastState | null
  openExternal: (url: string) => void
  dismiss: () => void
}

/**
 * Open a URL in a new browser tab. Falls back to copying the URL to the
 * clipboard and surfacing a transient toast when `window.open` is blocked
 * by an iframe sandbox or popup blocker (e.g. inside the Conductor host).
 *
 * The toast variant signals whether the clipboard write actually succeeded
 * (`"copied"`) or failed (`"manual"` — typical on insecure-context HTTP, or
 * when the user has denied permission). The consumer should render copy
 * accordingly so the user is not lied to.
 */
export function useOpenExternal(): OpenExternalApi {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setToast(null)
  }, [clearTimer])

  const showFallback = useCallback(
    (url: string, variant: ToastVariant) => {
      clearTimer()
      setToast({ url, variant })
      timeoutRef.current = window.setTimeout(() => {
        dismiss()
      }, 4000)
    },
    [clearTimer, dismiss],
  )

  const openExternal = useCallback(
    (url: string) => {
      const win = window.open(url, "_blank", "noopener")
      if (win) return
      void navigator.clipboard
        .writeText(url)
        .then(() => showFallback(url, "copied"))
        .catch(() => showFallback(url, "manual"))
    },
    [showFallback],
  )

  useEffect(() => clearTimer, [clearTimer])

  return { toast, openExternal, dismiss }
}
