import type { ReactNode } from "react"
import { Badge } from "@miragon/mcp-toolkit-ui"

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
    <details
      open={defaultOpen || undefined}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <h3 className="text-lg font-medium">{title}</h3>
        {count !== undefined && <Badge variant={badgeVariant}>{count}</Badge>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
