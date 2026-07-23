import { useHostActions } from "./use-host-actions.js"

/**
 * The single, consistent "jump to the native CIB Seven Cockpit" affordance. Neutral
 * outline (like {@link DrillButton}, since it's deterministic navigation, not AI), a ▦
 * glyph and an external ↗ to signal it leaves the app. Owns the host bridge call, so
 * callers pass only the URL. Replaces the ad-hoc mix of plain links and filled buttons.
 */
export function OpenInCockpitLink({
  url,
  label = "Cockpit",
  size = "sm",
}: {
  url: string
  label?: string
  size?: "sm" | "md"
}) {
  const host = useHostActions()
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
      aria-label={label}
      className={`border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border font-medium outline-none transition-colors focus-visible:ring-2 ${pad}`}
    >
      <span aria-hidden="true">▦</span>
      {label}
      <span aria-hidden="true">↗</span>
    </a>
  )
}
