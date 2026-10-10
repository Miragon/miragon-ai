import { useLocale } from "@miragon/mcp-toolkit-ui"
import { McpAppView, type McpAppViewLabels } from "@miragon/mcp-toolkit-ui/app"
import type { ComponentProps } from "react"
import type { Locale } from "../profile-constants.js"
import { supportedLanguage } from "./host-context.js"
import { useShellHost } from "./shell-host.js"

/**
 * Host-chrome strings per locale. The widgets localize via their module
 * catalogs, but the McpAppView chrome (refresh button, loading/fullscreen
 * labels) renders the toolkit's developer defaults ("Waiting for pipeline
 * result...") unless the `labels` prop is set — this binds it to the locale
 * the ProfileGate provides, in the product's voice for both languages.
 */
export const APP_VIEW_LABELS: Readonly<Record<Locale, Required<McpAppViewLabels>>> = {
  en: {
    loading: "Loading view…",
    cancelled: "Tool call cancelled. Ask in the chat to show this view again.",
    refresh: "Refresh",
    refreshing: "Updating…",
    enterFullscreen: "Full screen",
    exitFullscreen: "Exit full screen",
    build: "Edit view",
  },
  de: {
    loading: "Ansicht wird geladen…",
    cancelled: "Tool-Aufruf abgebrochen. Frag im Chat erneut nach dieser Ansicht.",
    refresh: "Aktualisieren",
    refreshing: "Wird aktualisiert…",
    enterFullscreen: "Vollbild",
    exitFullscreen: "Vollbild beenden",
    build: "Ansicht bearbeiten",
  },
}

/**
 * Whether the view may ask for fullscreen: the host offers it (mcp-use's
 * negotiated `availableDisplayModes`), or the view is already there (its
 * Collapse button must stay).
 */
export function fullscreenAvailable(host: {
  displayMode: string
  availableDisplayModes: readonly string[]
}): boolean {
  return host.displayMode === "fullscreen" || host.availableDisplayModes.includes("fullscreen")
}

/**
 * The toolkit's McpAppView, localized and bound to the host's display modes:
 * its toolbar Fullscreen toggle renders unconditionally and a host without
 * fullscreen rejects the request, so the wrapper is marked and the shell
 * stylesheet (`theme.css`) hides the dead button there (upstream:
 * mcp-toolkit#178). `display: contents` keeps the wrapper out of layout.
 */
export function LocalizedAppView(props: Omit<ComponentProps<typeof McpAppView>, "labels">) {
  const locale = useLocale()
  const host = useShellHost()
  return (
    <div
      style={{ display: "contents" }}
      data-shell-fullscreen={fullscreenAvailable(host) ? "available" : "unavailable"}
    >
      <McpAppView {...props} labels={APP_VIEW_LABELS[supportedLanguage(locale) ?? "en"]} />
    </div>
  )
}
