import { useLayoutEffect, useSyncExternalStore } from "react"
import { applyDocumentTheme, resolveTheme, type EffectiveTheme } from "./host-context.js"
import { useShellHost } from "./shell-host.js"

const OS_DARK_QUERY = "(prefers-color-scheme: dark)"

function osDarkQuery(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined
  return window.matchMedia(OS_DARK_QUERY)
}

function subscribeOsTheme(onChange: () => void): () => void {
  const query = osDarkQuery()
  query?.addEventListener("change", onChange)
  return () => query?.removeEventListener("change", onChange)
}

const osPrefersDark = (): boolean => osDarkQuery()?.matches ?? false

/**
 * Resolve and apply the view's ONE effective theme: an explicit profile
 * `"light"`/`"dark"` wins; `"system"`, `undefined` (profile still loading,
 * feed unavailable) and anything unknown follow the HOST's theme
 * (`hostContext.theme`, via {@link useShellHost}), then the OS
 * `prefers-color-scheme` (live). Applied before paint to `.dark`,
 * `data-theme` and `color-scheme` on `<html>` together, plus the host's
 * palette onto the neutral tokens while the view follows the host — see
 * `applyDocumentTheme`. Accepts a loose `string` so a profile field can be
 * passed straight from an untyped feed; returns the resolved theme.
 */
export function useApplyTheme(profileTheme: string | undefined): EffectiveTheme {
  const host = useShellHost()
  const osDark = useSyncExternalStore(subscribeOsTheme, osPrefersDark, () => false)
  const theme = resolveTheme(profileTheme, host.theme, osDark)
  useLayoutEffect(() => {
    applyDocumentTheme(document.documentElement, {
      theme,
      hostTheme: host.theme,
      hostVariables: host.styleVariables,
    })
  }, [theme, host.theme, host.styleVariables])
  return theme
}
