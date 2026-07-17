import type { ReactNode } from "react"
import { TONE_SOFT, type ToneVariant } from "./tone-utils.js"

export type { ToneVariant }

/**
 * Page-level header used at the top of a dashboard widget. Mirrors the
 * `.header` block in the Miragon mockups: tinted icon tile, title, subtitle
 * with live pill / meta info, and an optional right-aligned actions slot.
 *
 * `size="detail"` renders the compact detail-page variant (smaller h1, no
 * icon tile expected) used by the process/incident hero headers; `badge`
 * (e.g. a `StatusBadge`) sits above the title, `titleSuffix` (e.g. a
 * `VersionChip`) inline after it.
 */
export function WidgetHeader({
  icon,
  iconTone = "critical",
  title,
  titleSuffix,
  badge,
  sub,
  actions,
  size = "default",
}: {
  icon?: ReactNode
  iconTone?: ToneVariant
  title: ReactNode
  /** Inline suffix inside the h1, e.g. `<VersionChip version={3} />`. */
  titleSuffix?: ReactNode
  /** Rendered above the title, e.g. a `StatusBadge`. */
  badge?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  size?: "default" | "detail"
}) {
  const h1Class =
    size === "detail"
      ? "text-foreground mb-1.5 text-2xl font-bold tracking-tight"
      : "text-foreground mb-1.5 text-3xl font-bold leading-tight tracking-tight"
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {icon && (
          <div
            className={`mb-3.5 grid size-11 place-items-center rounded-xl text-xl ${TONE_SOFT[iconTone]}`}
          >
            {icon}
          </div>
        )}
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
