import { formatNumber } from "@miragon-ai/widget-shell/widgets"

/**
 * A count as the widgets render it, in the view's locale ("1.234" in a
 * German view). `null` is a number the server could not vouch for (a capped
 * scan, an unavailable enrichment read) — it renders as "—", never as a `0`
 * that reads as a fact (the honest-numbers rule, CLAUDE.md invariant 7).
 */
export function formatCount(value: number | null | undefined): string {
  return formatNumber(value)
}

/**
 * An exact count, or — when only a capped scan's share of it is known — that
 * share as the lower bound it is ("≥2,000"), never as the total.
 */
export function formatCountAtLeast(exact: number | null, scanned: number): string {
  return exact === null ? `≥${formatNumber(scanned)}` : formatNumber(exact)
}
