import type { ReactNode } from "react"
import { Badge, cn, FOCUS_RING } from "@miragon/mcp-toolkit-ui"
import { ChevronRight } from "lucide-react"
import { Icon } from "./icon.js"

/**
 * Collapsible disclosure section — `<details>`/`<summary>` with the chevron,
 * heading and optional count badge. Lifted from the camunda7 instance detail;
 * the analytics dashboard tables inline-copied the same markup four times
 * before this became shared.
 */
export function Section({
  title,
  count,
  badgeVariant = "secondary",
  defaultOpen = false,
  onToggle,
  children,
}: {
  title: ReactNode
  count?: number
  /** `destructive` for error/incident counts, `secondary` (default) otherwise. */
  badgeVariant?: "secondary" | "destructive"
  defaultOpen?: boolean
  /** Notified when the disclosure opens/closes — lets callers lazy-mount content. */
  onToggle?: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <details open={defaultOpen || undefined} onToggle={(e) => onToggle?.(e.currentTarget.open)}>
      <summary
        className={cn(
          "flex w-fit cursor-pointer list-none items-center gap-2 rounded-sm [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <Icon
          icon={ChevronRight}
          className="text-muted-foreground transition-transform motion-reduce:transition-none [[open]>summary>&]:rotate-90"
        />
        {/* The section step of the type scale: 21 px / 600, the CI h3. */}
        <h3 className="text-section">{title}</h3>
        {count !== undefined && <Badge variant={badgeVariant}>{count}</Badge>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
