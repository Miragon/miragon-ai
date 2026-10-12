import type { MouseEvent } from "react"
import { cn, FOCUS_RING, useLocale } from "@miragon/mcp-toolkit-ui"
import { ExternalLink } from "lucide-react"
import { useHostActions } from "@miragon/mcp-toolkit-ui/app"
import { Icon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { MENU_ITEM } from "./menu-item.js"

/**
 * The single, consistent "jump to the engine's own web app" affordance (the
 * vendor's cockpit, which leaves this app in a new tab). Neutral outline,
 * like {@link DrillButton}, since it is deterministic navigation, not AI.
 * Named after the vendor ("In CIB seven öffnen" / "Open in CIB seven"), not
 * "Cockpit", which is this app's own name; the accessible name adds that it
 * opens a new tab. Owns the host bridge call, so callers pass only the URL.
 * `variant="menuitem"` makes it an entry of a row's action menu
 * ({@link MENU_ITEM}, `role="menuitem"`, its icon in front like the menu's
 * other entries).
 */
export function OpenInCockpitLink({
  url,
  vendor,
  label,
  size = "sm",
  variant = "outline",
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
  /** `outline` (default): a link on its own; `menuitem`: an entry of an action menu. */
  variant?: "outline" | "menuitem"
}) {
  const host = useHostActions()
  const labels = kitLabels(useLocale())
  const text = label ?? labels.openInVendor(vendor)
  const pad = size === "md" ? "text-dense px-3 py-1.5" : "text-small px-2.5 py-1"
  const link = {
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      host.openLink(url)
    },
    "aria-label": labels.opensInNewTab(text),
  }
  if (variant === "menuitem") {
    return (
      <a {...link} role="menuitem" tabIndex={-1} className={MENU_ITEM}>
        <Icon icon={ExternalLink} dense />
        {text}
      </a>
    )
  }
  return (
    <a
      {...link}
      className={cn(
        "border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border font-medium transition-colors",
        FOCUS_RING,
        pad,
      )}
    >
      {text}
      <Icon icon={ExternalLink} dense />
    </a>
  )
}
