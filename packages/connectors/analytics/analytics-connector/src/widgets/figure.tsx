import type { ReactNode } from "react"
import { CountPill } from "@miragon/mcp-toolkit-ui"
import { countTone, formatNumber } from "@miragon/pulse-widget-shell/widgets"

/**
 * One figure in an analytics table (U17). "—" means one thing in every
 * analytics view: no measured value, never a plausible 0 and never "not
 * deployed" (that is an empty cell). Why this one is missing (an engine that
 * sends no metrics, a gauge no engine reports, nothing ended in the period)
 * is TEXT, not only a tooltip: a screen reader reads the reason in place of
 * the dash, a pointer gets it as the tooltip, and the table's
 * {@link FigureLegend} shows it to everyone else (keyboard, touch).
 */
export function Figure({
  value,
  format = formatNumber,
  why,
}: {
  value: number | null
  format?: (value: number) => string
  /** Why the figure is missing: read out in place of the dash, and its tooltip. */
  why: string
}) {
  if (value === null) {
    return (
      <span title={why} data-figure="missing">
        <span aria-hidden="true">{formatNumber(null)}</span>
        <span className="sr-only">{why}</span>
      </span>
    )
  }
  return <>{format(value)}</>
}

/**
 * A count that is a state (decision f): open incidents, jobs without retries
 * (dead jobs). On the kit's one ladder (`countTone`, the one camunda7 reads
 * the same counts by): a danger `CountPill` while there is any, the number
 * itself in the foreground; none is a plain count, and a count nobody
 * measured is "—" with its reason ({@link Figure}).
 */
export function StateCount({ value, why }: { value: number | null; why?: string }) {
  if (countTone(value) === "danger") {
    return <CountPill tone="danger">{formatNumber(value)}</CountPill>
  }
  return why === undefined ? <>{formatNumber(value)}</> : <Figure value={value} why={why} />
}

/** A quiet note under a table: what a sign in it means. */
export function Legend({ children }: { children: ReactNode }) {
  return (
    <p data-legend="" className="text-muted-foreground text-small mt-2">
      {children}
    </p>
  )
}

/**
 * The key under a table that can show "—": one line per reason a figure in
 * it is missing, each once and in the order given, so the dash's meaning is
 * on screen and needs no hover. Renders nothing while no figure is missing
 * (pass `false` for a reason that does not occur).
 */
export function FigureLegend({
  reasons,
}: {
  reasons: ReadonlyArray<string | false | null | undefined>
}) {
  const lines = [...new Set(reasons.filter((why): why is string => !!why))]
  return (
    <>
      {lines.map((why) => (
        <Legend key={why}>
          <span className="text-foreground font-medium">{formatNumber(null)}</span> {why}
        </Legend>
      ))}
    </>
  )
}
