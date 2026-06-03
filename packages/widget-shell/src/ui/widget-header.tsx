import type { ReactNode } from "react"
import { TONE_SOFT, type ToneVariant } from "./tone-utils.js"

export type { ToneVariant }

/**
 * Page-level header used at the top of a dashboard widget. Mirrors the
 * `.header` block in the Miragon mockups: tinted icon tile, title, subtitle
 * with live pill / meta info, and an optional right-aligned actions slot.
 */
export function WidgetHeader({
  icon,
  iconTone = "critical",
  title,
  sub,
  actions,
}: {
  icon?: ReactNode
  iconTone?: ToneVariant
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
}) {
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
        <h1 className="text-foreground mb-1.5 text-3xl font-bold leading-tight tracking-tight">
          {title}
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
