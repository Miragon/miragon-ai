import type { KeyboardEvent, MouseEvent, ReactNode } from "react"

/**
 * Bordered card with a clickable summary bar and a collapsible body. Matches
 * the `.group-card` pattern shared between overview and detail mockups —
 * used for both process groups (overview) and activity groups (detail).
 *
 * The summary uses `role="button"` rather than a `<button>` element so that
 * action buttons / anchors can render inside it without producing invalid
 * nested-interactive-element HTML.
 */
export function GroupCard({
  expanded,
  onToggle,
  summary,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  summary: ReactNode
  children?: ReactNode
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onToggle()
    }
  }

  // The summary may contain its own controls (drill buttons, AI ✦, external
  // links). A click that lands on one of those should run that control only —
  // not also toggle the card.
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label")) return
    onToggle()
  }

  return (
    <div className="border-border mb-2 overflow-hidden rounded-lg border">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`bg-card hover:bg-muted focus-visible:ring-ring/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 ${
          expanded ? "border-border border-b" : ""
        }`}
      >
        {summary}
      </div>
      {expanded && children && <div>{children}</div>}
    </div>
  )
}
