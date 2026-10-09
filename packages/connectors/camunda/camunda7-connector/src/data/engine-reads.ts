/**
 * The honest-numbers rule every data builder follows (CLAUDE.md invariant 7,
 * `.claude/skills/add-bpm-feature`): PRIMARY rows and counts — what a view
 * exists to show, and every number its summary reports — propagate engine
 * failures (`withToolErrors` turns them into a tool error). Only ENRICHMENT
 * (display names, diagram XML, cockpit links, optional history) degrades, and
 * it degrades to `null` — never to a `0`, `[]` or `{}` that reads as a fact.
 * These helpers are the two halves of that rule.
 */

/** A `/…/count` reply's number; a reply without one is an engine-contract breach, not a 0. */
export function countOf(res: unknown): number {
  const count = (res as { count?: unknown } | null)?.count
  if (typeof count !== "number") {
    throw new Error("The engine answered a count query without a count.")
  }
  return count
}

/** A list reply's rows; anything but an array is an engine-contract breach, not "no rows". */
export function rowsOf<T>(res: unknown): T[] {
  if (!Array.isArray(res)) {
    throw new Error("The engine answered a list query without a list.")
  }
  return res as T[]
}

/** An ENRICHMENT read: its failure degrades to `null` (rendered "—"), never to an empty value. */
export function optional<T>(read: Promise<T>): Promise<T | null> {
  return read.catch(() => null)
}

/**
 * How many incident rows a recency scan reads (newest first). The scan feeds
 * enrichment — messages, timestamps, breakdowns — never a total: totals come
 * from `/count` endpoints and statistics.
 */
export const INCIDENT_SCAN_LIMIT = 200

export const DAY_MS = 24 * 60 * 60 * 1000
