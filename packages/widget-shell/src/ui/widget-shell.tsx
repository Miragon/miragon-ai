import type { ReactNode } from "react"
import { useWidget } from "mcp-use/react"

/**
 * Top-level container for a Miragon-styled widget. Sets max-width, padding,
 * background, and the default text/font conventions used by all dashboards.
 */
export function WidgetShell({ children }: { children: ReactNode }) {
  const { displayMode } = useWidget()
  const isFullscreen = displayMode === "fullscreen"

  return (
    <div className="bg-card text-card-foreground min-h-full">
      <div
        className={`mx-auto flex flex-col gap-6 px-9 py-8 ${isFullscreen ? "max-w-full" : "max-w-7xl"}`}
      >
        {children}
      </div>
    </div>
  )
}
