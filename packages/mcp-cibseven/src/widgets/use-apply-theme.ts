import { useEffect } from "react"

/**
 * Apply the profile theme to the widget document by toggling the `.dark` class
 * on `<html>`, which flips the toolkit's CSS variables (and every `dark:`
 * Tailwind variant). `"system"`, `undefined` (profile still loading or feed
 * unavailable) and any unknown value follow the OS `prefers-color-scheme`
 * live via `matchMedia` — the profile default IS `"system"`, so an absent
 * profile must not force light. Runs inside the widget iframe —
 * it themes our rendered document, not the host chrome. Accepts a loose `string`
 * so the gateway can pass a profile field straight from an untyped feed.
 */
export function useApplyTheme(theme: string | undefined): void {
  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const apply = (dark: boolean) => root.classList.toggle("dark", dark)

    if (theme === "dark") {
      apply(true)
      return
    }
    if (theme === "light") {
      apply(false)
      return
    }
    // "system" / undefined: resolve against the OS preference and keep it in sync.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      apply(false)
      return
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const sync = () => apply(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [theme])
}
