import { formatNumber } from "@miragon-ai/widget-shell/widgets"

/**
 * One figure in an analytics table (U17). "—" means one thing in every
 * analytics view: no measured value, never a plausible 0 and never "not
 * deployed" (that is an empty cell). Its tooltip says why this one is
 * missing: an engine that sends no metrics, a gauge no engine reports,
 * nothing ended in the period.
 */
export function Figure({
  value,
  format = formatNumber,
  why,
}: {
  value: number | null
  format?: (value: number) => string
  /** Why the figure is missing, for the "—" tooltip. */
  why: string
}) {
  if (value === null) return <span title={why}>{formatNumber(null)}</span>
  return <>{format(value)}</>
}
