import type { ReactNode } from "react"
import { Skeleton } from "@miragon/mcp-toolkit-ui"
import { ChevronRight, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import { cn } from "./cn.js"
import { Icon } from "./icon.js"
import {
  MICRO_LABEL,
  TONE_BORDER,
  TONE_DOT,
  TONE_ICON,
  TONE_TINT,
  type ToneVariant,
} from "./tone-utils.js"

type TrendDirection = "up" | "down" | "flat"

/** Direction-derived fallback (incident-biased: up = worse); `trendTone` wins. */
const TREND_TONE: Record<TrendDirection, ToneVariant> = {
  up: "danger",
  down: "success",
  flat: "neutral",
}

const TREND_ICON: Record<TrendDirection, LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
}

interface KpiCellBase {
  label: ReactNode
  value: ReactNode
  /** Small fraction shown next to the value, e.g. " /14" */
  fraction?: ReactNode
  /** A short note under the value ("+2 seit gestern"); its words stay neutral. */
  trend?: ReactNode
  /** Draws a Lucide trend icon before the note, in the trend's tone. */
  trendDirection?: TrendDirection
  /**
   * Explicit trend tone: overrides the direction-derived fallback. Shown as
   * the direction icon's colour, or as a dot when there is no direction.
   */
  trendTone?: ToneVariant
  /**
   * The state the number stands for. Shown as a dot next to the label (strip)
   * or as the card's tint and edge (soft); the number itself stays neutral.
   */
  tone?: ToneVariant
}

/**
 * `onClick` renders the cell as a button — turns a metric into a nav entry
 * point (e.g. "Incidents" → open the incidents dashboard). A clickable cell
 * requires an `ariaLabel`, since the visible label/value may be terse.
 */
export type KpiCell = KpiCellBase &
  ({ onClick: () => void; ariaLabel: string } | { onClick?: never; ariaLabel?: never })

/**
 * Bordered KPI strip — typically 4 cells across. Cells flow as columns; cell
 * count adapts via `grid-cols-N` (1–6; more than 6 cells wrap onto further rows).
 *
 * Responsive: 4+ cells fall back to 2 columns on narrow hosts (claude.ai inline
 * / mobile iframes are frequently <500px, where five cells side-by-side leave
 * ~40px of content each). Dividers come from a `gap-px` grid on a `bg-border`
 * background (cells are `bg-card`), so they stay correct at any wrap — a
 * per-cell border count tied to a fixed column would be wrong once it reflows.
 */
const COL_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
}

export interface KpiGridHeader {
  /** Group label, e.g. "Health". Renders uppercase in the strip header. */
  label: ReactNode
  /** Optional muted badge to the right of the label, e.g. "Status der …". */
  badge?: ReactNode
}

/**
 * The trend note: neutral words (black next to a state, muted without one)
 * with the state beside them as a direction icon or a dot in the tone, never
 * as coloured digits (CI §3.3).
 */
function TrendLine({ cell }: { cell: KpiCell }) {
  const direction = cell.trendDirection
  const tone = cell.trendTone ?? (direction ? TREND_TONE[direction] : undefined)
  const marked = tone !== undefined && tone !== "neutral"
  return (
    <div className="mt-1.5 flex items-center gap-1 text-xs">
      {direction ? (
        <Icon
          icon={TREND_ICON[direction]}
          dense
          className={TONE_ICON[cell.trendTone ?? TREND_TONE[direction]]}
        />
      ) : (
        marked && (
          <span
            aria-hidden="true"
            data-trend-tone={tone}
            className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
          />
        )
      )}
      <span className={marked ? "text-foreground" : "text-muted-foreground"}>{cell.trend}</span>
    </div>
  )
}

/** Label + value + fraction + trend — shared by the strip and soft variants. */
function KpiCellBody({ cell, variant }: { cell: KpiCell; variant: "strip" | "soft" }) {
  return (
    <>
      <div
        className={
          variant === "soft"
            ? "flex items-center justify-between gap-2 text-sm font-medium"
            : "text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium"
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {variant === "strip" && cell.tone && cell.tone !== "neutral" && (
            <span
              aria-hidden="true"
              data-tone={cell.tone}
              className={cn("size-2 shrink-0 rounded-full", TONE_DOT[cell.tone])}
            />
          )}
          {cell.label}
        </span>
        {cell.onClick && <Icon icon={ChevronRight} dense />}
      </div>
      <div
        className={
          variant === "soft"
            ? "mt-1 text-2xl font-bold tabular-nums"
            : "text-foreground mt-1.5 text-2xl leading-none font-bold tracking-tight tabular-nums"
        }
      >
        {cell.value}
        {cell.fraction && (
          <span
            className={cn(
              "ml-0.5 text-sm font-normal",
              variant === "strip" && "text-muted-foreground",
            )}
          >
            {cell.fraction}
          </span>
        )}
      </div>
      {cell.trend && <TrendLine cell={cell} />}
    </>
  )
}

/** A soft card: the tone's tint and edge around neutral text. */
function softCardClass(tone: ToneVariant | undefined): string {
  const t = tone ?? "neutral"
  return cn("text-foreground rounded-xl border p-4", TONE_TINT[t], TONE_BORDER[t])
}

/**
 * When `boxed`, the strip is wrapped in a rounded bordered card and an
 * optional `header` row carries a group label (matches the `.kpi-block`
 * pattern in the cockpit-overview mockup). When unboxed (default), the
 * strip uses the lighter `border-y` look used by the incidents dashboard.
 *
 * `variant="soft"` renders each cell as a card in its tone's tint and edge
 * (the failure-dashboard summary look) in a gap grid instead of the bordered
 * strip — `boxed`/`header` don't apply there. In both variants the digits
 * stay neutral: a coloured number is never the only carrier of a state.
 */
export function KpiGrid({
  cells,
  boxed = false,
  header,
  variant = "strip",
  ariaLabel,
  className,
}: {
  cells: KpiCell[]
  boxed?: boolean
  header?: KpiGridHeader
  variant?: "strip" | "soft"
  ariaLabel?: string
  className?: string
}) {
  const cols = Math.min(Math.max(cells.length, 1), 6)
  const colClass = COL_CLASS[cols]
  if (variant === "soft") {
    return (
      <div
        role={ariaLabel ? "group" : undefined}
        aria-label={ariaLabel}
        className={cn("grid gap-4", colClass, className)}
      >
        {cells.map((cell, idx) => {
          const body = <KpiCellBody cell={cell} variant="soft" />
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              data-tone={cell.tone}
              className={cn(
                "focus-visible:ring-ring cursor-pointer text-left transition-colors outline-none focus-visible:ring-2",
                softCardClass(cell.tone),
              )}
            >
              {body}
            </button>
          ) : (
            <div key={idx} data-tone={cell.tone} className={softCardClass(cell.tone)}>
              {body}
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(boxed && "border-border overflow-hidden rounded-lg border", className)}
    >
      {header && (
        <div
          className={cn(
            "border-border bg-muted text-muted-foreground flex items-center gap-2 border-b px-4 py-2",
            MICRO_LABEL,
          )}
        >
          <span>{header.label}</span>
          {header.badge && (
            <span className="border-border bg-card text-muted-foreground rounded border px-1.5 py-0 text-[10px] font-medium normal-case">
              {header.badge}
            </span>
          )}
        </div>
      )}
      {/* gap-px on bg-border draws the dividers; cells are bg-card. This is
          wrap-safe (every reflowed gap gets a divider) unlike per-cell borders
          tied to a fixed column count. */}
      <div className={cn("bg-border grid gap-px", colClass, !boxed && "border-border border-y")}>
        {cells.map((cell, idx) => {
          const body = <KpiCellBody cell={cell} variant="strip" />
          return cell.onClick ? (
            <button
              key={idx}
              type="button"
              onClick={cell.onClick}
              aria-label={cell.ariaLabel}
              className="bg-card hover:bg-muted focus-visible:ring-ring cursor-pointer px-5 py-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              {body}
            </button>
          ) : (
            <div key={idx} className="bg-card px-5 py-4">
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Loading placeholder mirroring {@link KpiGrid}'s geometry — same wrapper,
 * grid and cell padding for both variants, so the layout doesn't jump when
 * the data arrives.
 */
export function KpiGridSkeleton({
  cells,
  variant = "strip",
  boxed = false,
}: {
  cells: number
  variant?: "strip" | "soft"
  boxed?: boolean
}) {
  const cols = Math.min(Math.max(cells, 1), 6)
  const colClass = COL_CLASS[cols]
  if (variant === "soft") {
    return (
      <div aria-busy="true" className={cn("grid gap-4", colClass)}>
        {Array.from({ length: cells }, (_, idx) => (
          <div key={idx} className="bg-muted border-border rounded-xl border p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-7 w-14" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div
      aria-busy="true"
      className={cn(boxed && "border-border overflow-hidden rounded-lg border")}
    >
      <div className={cn("bg-border grid gap-px", colClass, !boxed && "border-border border-y")}>
        {Array.from({ length: cells }, (_, idx) => (
          <div key={idx} className="bg-card px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}
