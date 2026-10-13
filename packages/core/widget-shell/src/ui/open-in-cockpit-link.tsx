import type { MouseEvent } from "react"
import { buttonVariants, useLocale } from "@miragon/mcp-toolkit-ui"
import { ExternalLink } from "lucide-react"
import { useHostActions } from "@miragon/mcp-toolkit-ui/app"
import { Icon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { MENU_ITEM } from "./menu-item.js"

/**
 * The single, consistent "jump to the engine's own web app" affordance (the
 * vendor's cockpit, which leaves this app in a new tab). A secondary button
 * of the view's one action size (the toolkit's `buttonVariants` outline,
 * `sm`: 32 px, 14 px, 600, like the chat hand-offs beside it), since it is
 * deterministic navigation, not AI. It belongs in the view's action group,
 * never in the meta line.
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
  /** `outline` (default): a link on its own; `menuitem`: an entry of an action menu. */
  variant?: "outline" | "menuitem"
}) {
  const host = useHostActions()
  const labels = kitLabels(useLocale())
  const text = label ?? labels.openInVendor(vendor)
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
    <a {...link} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {text}
      <Icon icon={ExternalLink} dense />
    </a>
  )
}
