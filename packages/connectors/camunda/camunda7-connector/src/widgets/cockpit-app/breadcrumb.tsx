import { FOCUS_RING, cn } from "@miragon/mcp-toolkit-ui"
import { Icon } from "@miragon-ai/widget-shell/widgets"
import { ChevronRight } from "lucide-react"
import { translator } from "../../messages/index.js"
import { crumbLabel, type CockpitView } from "../nav-core.js"

/**
 * The breadcrumb IS the stack — every crumb pops back to the view it names, so
 * drilling instance → back → next instance never re-drills from the top.
 * `rootLabel` renders a synthetic leading crumb (the standalone shell's origin
 * widget) that leaves the trail entirely via `onPop(-1)`. Renders nothing while
 * there is only a single entry (a root view without a trail).
 */
export function NavBreadcrumb({
  stack,
  locale,
  onPop,
  rootLabel,
}: {
  stack: CockpitView[]
  locale: string
  onPop: (to: number) => void
  rootLabel?: string
}) {
  const entries = [
    ...(rootLabel !== undefined ? [{ label: rootLabel, index: -1 }] : []),
    ...stack.map((view, index) => ({ label: crumbLabel(view, locale), index })),
  ]
  if (entries.length <= 1) return null
  return (
    <nav
      aria-label={translator(locale, "cockpit.aria.breadcrumb")}
      className="text-muted-foreground text-dense mb-4 flex flex-wrap items-center gap-1.5"
    >
      {entries.map((entry, position) => (
        <span key={position} className="inline-flex items-center gap-1.5">
          {position > 0 && <Icon icon={ChevronRight} dense />}
          {position < entries.length - 1 ? (
            <button
              type="button"
              onClick={() => onPop(entry.index)}
              className={cn("hover:text-foreground rounded", FOCUS_RING)}
            >
              {entry.label}
            </button>
          ) : (
            <span aria-current="page" className="text-foreground font-medium">
              {entry.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
