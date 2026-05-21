/**
 * Locale-aware timestamp formatting helpers used across widgets.
 *
 * Each helper returns an em-dash for null/undefined input so callers can
 * render directly into a table cell without per-row branching.
 */

const EMPTY = "—"

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  return new Date(iso).toLocaleString()
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  return new Date(iso).toLocaleDateString()
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  return new Date(iso).toLocaleTimeString()
}

/**
 * Format a millisecond duration in a compact, human-readable form
 * (e.g. `420ms`, `12s`, `3m 7s`, `1h 24m`). Returns an em-dash for
 * null or negative input.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return EMPTY
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remS = s % 60
  if (m < 60) return `${m}m ${remS}s`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return `${h}h ${remM}m`
}
