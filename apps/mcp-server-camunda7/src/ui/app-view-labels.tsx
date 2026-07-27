import { useLocale } from "@miragon/mcp-toolkit-ui"
import { McpAppView, type McpAppViewLabels } from "@miragon/mcp-toolkit-ui/app"
import type { ComponentProps } from "react"

/**
 * Host-chrome strings per locale. The widgets localize via their module
 * catalogs, but the McpAppView chrome (refresh button, loading/fullscreen
 * labels) renders the toolkit's English defaults unless the `labels` prop is
 * set — this binds it to the profile locale the ProfileGate provides.
 */
const LABELS: Record<string, McpAppViewLabels> = {
  de: {
    loading: "Wird geladen…",
    refresh: "Aktualisieren",
    refreshing: "Aktualisiert…",
    enterFullscreen: "Vollbild",
    exitFullscreen: "Vollbild beenden",
    build: "Build",
  },
}

export function LocalizedAppView(props: Omit<ComponentProps<typeof McpAppView>, "labels">) {
  const locale = useLocale()
  return <McpAppView {...props} labels={LABELS[locale.split("-")[0]]} />
}
