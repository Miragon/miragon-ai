import { useLocale } from "@miragon/mcp-toolkit-ui"
import { ExternalLink } from "lucide-react"
import { Icon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { useHostActions } from "./use-host-actions.js"

/**
 * The single, consistent "jump to the engine's own web app" affordance (the
 * vendor's cockpit, which leaves this app in a new tab). Neutral outline,
 * like {@link DrillButton}, since it is deterministic navigation, not AI.
 * Named after the vendor ("In CIB seven öffnen" / "Open in CIB seven"), not
 * "Cockpit", which is this app's own name; the accessible name adds that it
 * opens a new tab. Owns the host bridge call, so callers pass only the URL.
 */
export function OpenInCockpitLink({
  url,
  vendor,
  label,
  size = "sm",
}: {
  url: string
  /**
   * The engine product's display name from the provider branding
   * (`provider.branding.displayName`: "CIB seven", "Camunda 7", "Operaton").
   * Without it the link reads "Im Engine-Cockpit öffnen" / "Open in engine cockpit".
   */
  vendor?: string
  /** Visible text override for a narrower target, e.g. "Instanz in CIB seven öffnen". */
  label?: string
  size?: "sm" | "md"
}) {
  const host = useHostActions()
  const labels = kitLabels(useLocale())
  const text = label ?? labels.openInVendor(vendor)
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault()
        host.openLink(url)
      }}
      aria-label={labels.opensInNewTab(text)}
      className={`border-border text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors outline-none focus-visible:ring-2 ${pad}`}
    >
      {text}
      <Icon icon={ExternalLink} dense />
    </a>
  )
}
