import type { ReactNode } from "react"
import { cn } from "./cn.js"

/**
 * Bordered list-row card — truncating title/subtitle block on the left,
 * action buttons pinned right. The row shape the engine-health cluster list
 * and the cluster-detail rows used to copy verbatim.
 */
export function RowCard({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-border flex items-center justify-between gap-3 rounded-lg border p-3",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">{title}</div>
        {subtitle && <div className="text-muted-foreground truncate text-xs">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}
