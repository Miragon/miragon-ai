/**
 * Locale-aware formatting helpers shared by every widget module. Each helper
 * returns an em-dash for null/undefined/empty input so callers can render
 * directly into a table cell without per-row branching.
 *
 * THE single source for timestamp/duration/truncate rendering — the modules'
 * former local copies drifted into three different duration styles ("3m 7s" /
 * "3.1m" / "3.1min"); the canonical style is the compact "3m 7s" family below.
 *
 * Dates render in the view's EFFECTIVE locale and the host's time zone, not
 * the iframe browser's: the shell's ProfileGate resolves them (explicit
 * profile language > host locale > English) and publishes them here with
 * {@link setFormatLocale} before its children render. Outside the shell (unit
 * renders, fixtures) the browser defaults apply.
 */

const EMPTY = "—"

/** The locale + time zone the date helpers render in. */
export interface FormatLocale {
  /** The effective UI language — what the shell's `LocaleProvider` carries. */
  language: string
  /** The BCP 47 tag dates format in (the host's full tag when it speaks `language`). */
  locale: string
  /** IANA time zone; `undefined` = the browser's. */
  timeZone?: string
}

let current: FormatLocale | undefined
const listeners = new Set<() => void>()

function sameFormatLocale(a: FormatLocale | undefined, b: FormatLocale | undefined): boolean {
  return a?.language === b?.language && a?.locale === b?.locale && a?.timeZone === b?.timeZone
}

/**
 * Publish the locale the date helpers render in (the shell's ProfileGate;
 * `undefined` restores the browser defaults). A no-op for an unchanged value,
 * so subscribers only re-render on a real change.
 */
export function setFormatLocale(next: FormatLocale | undefined): void {
  if (sameFormatLocale(current, next)) return
  current = next
  for (const listener of listeners) listener()
}

/** The published format locale — `useSyncExternalStore` snapshot. */
export function getFormatLocale(): FormatLocale | undefined {
  return current
}

/** Subscribe to {@link setFormatLocale} changes — `useSyncExternalStore` subscribe. */
export function subscribeFormatLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Options for a date helper: the published time zone folded in. */
function zoned(options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions {
  return current?.timeZone ? { ...options, timeZone: current.timeZone } : options
}

/** Parse an ISO string; null for unparsable input so callers render {@link EMPTY}. */
function parseDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  return parseDate(iso)?.toLocaleString(current?.locale, zoned()) ?? EMPTY
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY
  return parseDate(iso)?.toLocaleDateString(current?.locale, zoned()) ?? EMPTY
}

export function formatTime(
  iso: string | null | undefined,
  opts: { seconds?: boolean } = {},
): string {
  if (!iso) return EMPTY
  const date = parseDate(iso)
  if (!date) return EMPTY
  return opts.seconds === false
    ? date.toLocaleTimeString(current?.locale, zoned({ hour: "2-digit", minute: "2-digit" }))
    : date.toLocaleTimeString(current?.locale, zoned())
}

/**
 * Format a millisecond duration in a compact, human-readable form
 * (e.g. `420ms`, `12s`, `3m 7s`, `1h 24m`). Returns an em-dash for
 * null or negative input; fractional input is rounded to whole ms.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return EMPTY
  ms = Math.round(ms)
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

/** Truncate with an ellipsis; em-dash for null/empty input. */
export function truncate(value: string | null | undefined, max: number): string {
  if (!value) return EMPTY
  return value.length > max ? value.slice(0, max) + "…" : value
}
