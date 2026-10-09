/**
 * A count as the widgets render it. `null` is a number the server could not
 * vouch for (a capped scan, an unavailable enrichment read) — it renders as
 * "—", never as a `0` that reads as a fact (the honest-numbers rule, CLAUDE.md
 * invariant 7).
 */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString()
}
