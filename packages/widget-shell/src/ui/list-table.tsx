import type { ReactNode } from "react"
import { cn } from "./cn.js"
import { Th } from "./table.js"

export interface ListTableColumn {
  /** Header label; omit together with `plain` for an empty actions column. */
  label?: ReactNode
  align?: "left" | "right"
  /** Bare header cell without the MICRO_LABEL treatment (actions column). */
  plain?: boolean
  /** Merged into the Th (e.g. a compact `py-2`). */
  className?: string
}

/**
 * The cockpit table FRAME — `<table>`/`<thead>` classes and the `Th` header
 * row every list used to hand-copy. Deliberately only the frame: rows stay
 * hand-composed `<tr>` + `Td` per widget, because the cells are where lists
 * legitimately differ (badges, inline mutations, AI handoffs). Pair with
 * {@link TableEmptyState} instead of rendering an empty frame.
 */
export function ListTable({
  columns,
  ariaLabel,
  className,
  children,
}: {
  columns: ReadonlyArray<ListTableColumn>
  ariaLabel?: string
  /** Merged into the `<table>` (e.g. the compact `[&_th]:border-t-0`). */
  className?: string
  /** The `<tr>` rows. */
  children: ReactNode
}) {
  return (
    <table className={cn("w-full border-collapse text-sm", className)} aria-label={ariaLabel}>
      <thead className="bg-muted">
        <tr>
          {columns.map((column, index) => (
            <Th key={index} align={column.align} plain={column.plain} className={column.className}>
              {column.label}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}
