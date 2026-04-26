import type { ReactNode } from "react"

/**
 * Top-level container for a Miragon-styled widget. Sets max-width, padding,
 * background, and the default text/font conventions used by all dashboards.
 */
export function WidgetShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card text-ink min-h-full">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-9 py-8">{children}</div>
    </div>
  )
}
