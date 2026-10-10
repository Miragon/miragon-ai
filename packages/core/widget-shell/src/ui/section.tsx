import type { ReactNode } from "react"
import { Badge } from "@miragon/mcp-toolkit-ui"
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
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Icon
          icon={ChevronRight}
          className="text-muted-foreground transition-transform [[open]>summary>&]:rotate-90"
        />
        <h3 className="text-lg font-medium">{title}</h3>
        {count !== undefined && <Badge variant={badgeVariant}>{count}</Badge>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
