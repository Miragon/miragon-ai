import type { ReactNode } from "react"
import { cn, EmptyState, MICRO_LABEL, type StateHeadingLevel } from "@miragon/mcp-toolkit-ui"
import { CircleCheck, Inbox } from "lucide-react"

/**
 * Cockpit table primitives — the `th`/`td` class strings and the bordered
 * empty-state card that the process-instances and definitions tables used to
 * copy per column. Purely presentational; tables keep composing their own
 * `<table>`/`<thead>`/`<tbody>` structure (or the `ListTable` frame).
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
        "border-border text-dense border-b px-4 py-3 align-middle",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * What an empty result means:
 * - `empty`: nothing to show (no rows, no data yet) — a quiet `Inbox` icon;
 * - `done`: nothing LEFT to do ("No open incidents", "No failed jobs") — a
 *   `CircleCheck` in the success tone, so "all clear" never reads like
 *   missing data.
 */
export type EmptyVariant = "empty" | "done"

const EMPTY_ICON = {
  empty: { icon: Inbox, tone: "neutral" },
  done: { icon: CircleCheck, tone: "success" },
} as const

/**
 * The bordered card shown in place of a table (or a list, a chart) when
 * there is nothing to show: the toolkit's `EmptyState` — icon, a title (600),
 * one help line and up to two actions — in the card the table would take.
 * `children` is the title ("No jobs found"); `variant="done"` is the
 * "all done" state.
 */
export function TableEmptyState({
  children,
  variant = "empty",
  description,
  action,
  secondaryAction,
  icon,
  titleAs = "p",
  className,
}: {
  /** What is empty, in plain words ("No open incidents"). */
  children: ReactNode
  variant?: EmptyVariant
  /** One help line: why it is empty, or what to do next. */
  description?: ReactNode
  /** The primary next step (a `Button`). */
  action?: ReactNode
  /** A second, quieter step. */
  secondaryAction?: ReactNode
  /** A Lucide icon for the concrete situation (e.g. `<SearchX />` for no matches). */
  icon?: ReactNode
  /** Element of the title. Default `"p"`: it stands in for a table, not a section. */
  titleAs?: StateHeadingLevel
  className?: string
}) {
  const { icon: Glyph, tone } = EMPTY_ICON[variant]
  return (
    <div
      data-empty-variant={variant}
      className={cn("border-border bg-card rounded-md border", className)}
    >
      <EmptyState
        icon={icon ?? <Glyph strokeWidth={2.5} />}
        tone={tone}
        title={children}
        description={description}
        action={action}
        secondaryAction={secondaryAction}
        titleAs={titleAs}
      />
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
        "border-border bg-muted text-muted-foreground text-small ml-2 inline-block rounded-sm border px-2 py-0.5 align-middle font-mono font-medium",
        className,
      )}
    >
      v{version}
    </span>
  )
}
