import type { ReactNode } from "react"
import { cn } from "./cn.js"

/**
 * Page-level header at the top of a dashboard widget: title, subtitle with
 * live pill / meta info, and an optional right-aligned actions slot. No icon
 * tile above the title: a glyph in a tinted square over every heading is the
 * icon-tile pattern the CI rules out (anti-slop U2); a state belongs in a
 * `badge` (a `StatusBadge`) that says it in words.
 *
 * `size="detail"` renders the compact detail-page variant (smaller h1) used
 * by the process/incident hero headers; `badge` sits above the title,
 * `titleSuffix` (e.g. a `VersionChip`) inline after it.
 */
export function WidgetHeader({
  title,
  titleSuffix,
  badge,
  sub,
  actions,
  size = "default",
  className,
}: {
  title: ReactNode
  /** Inline suffix inside the h1, e.g. `<VersionChip version={3} />`. */
  titleSuffix?: ReactNode
  /** Rendered above the title, e.g. a `StatusBadge`. */
  badge?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  size?: "default" | "detail"
  className?: string
}) {
  const h1Class =
    size === "detail"
      ? "text-foreground mb-1.5 text-2xl font-bold tracking-tight"
      : "text-foreground mb-1.5 text-3xl font-bold leading-tight tracking-tight"
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {badge && <div className="mb-3">{badge}</div>}
        <h1 className={h1Class}>
          {title}
          {titleSuffix}
        </h1>
        {sub && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {sub}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
