import type { ReactNode } from "react"
import { cn } from "./cn.js"
import { MICRO_LABEL } from "./tone-utils.js"

/**
 * Cockpit table primitives — the `th`/`td` class strings and the bordered
 * empty-state card that the process-instances and definitions tables used to
 * copy per column. Purely presentational; tables keep composing their own
 * `<table>`/`<thead>`/`<tbody>` structure.
 */

const TH_LABEL = `border-border text-muted-foreground border-y px-4 py-2.5 ${MICRO_LABEL}`

export function Th({
  align = "left",
  plain = false,
  className,
  children,
}: {
  align?: "left" | "right"
  /** Bare header cell (e.g. the empty action column) — border/padding only. */
  plain?: boolean
  className?: string
  children?: ReactNode
}) {
  const base = plain
    ? "border-border border-y px-4 py-2.5"
    : `${TH_LABEL} ${align === "right" ? "text-right" : "text-left"}`
  return (
    <th scope="col" className={cn(base, className)}>
      {children}
    </th>
  )
}

export function Td({
  align = "left",
  className,
  children,
}: {
  align?: "left" | "right"
  className?: string
  children?: ReactNode
}) {
  return (
    <td
      className={cn(
        "border-border border-b px-4 py-3 align-middle",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  )
}

/** Bordered card shown in place of a table when there are no rows. */
export function TableEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
      {children}
    </div>
  )
}

/**
 * The `v3` definition-version chip rendered next to detail-page titles —
 * previously copied character-identical into three hero headers.
 */
export function VersionChip({
  version,
  className,
}: {
  version: number | string
  className?: string
}) {
  return (
    <span
      className={cn(
        "border-border bg-muted text-muted-foreground ml-2 inline-block rounded border px-2 py-0.5 align-middle font-mono text-xs font-medium",
        className,
      )}
    >
      v{version}
    </span>
  )
}
