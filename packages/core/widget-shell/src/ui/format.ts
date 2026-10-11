/**
 * Locale-aware formatting helpers shared by every widget module. Each helper
 * returns an em-dash for null/undefined/empty input so callers can render
 * directly into a table cell without per-row branching.
 *
 * THE single source for timestamp/number/percent/period/duration/truncate
 * rendering — the modules' former local copies drifted into three different
 * duration styles ("3m 7s" / "3.1m" / "3.1min"); the canonical style is the
 * compact family below ("3m 7s", German "3 Min. 7 s").
 *
 * Dates and numbers render in the view's EFFECTIVE locale (and dates in the
 * host's time zone), not the iframe browser's: the shell's ProfileGate
 * resolves them (explicit profile language > host locale > English) and
 * publishes them here with {@link setFormatLocale} before its children
 * render. Outside the shell (unit renders, fixtures) the browser defaults
 * apply and unit words are English.
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

// ── Numbers ─────────────────────────────────────────────────────────────────
//
// Every number a widget shows goes through these helpers, never `toFixed`
// or an argument-less `toLocaleString()` (an ESLint gate in widget code):
// both ignore the view's locale ("3.7%" in a German cockpit, "1,234" vs
// "1.234"). They read the same published locale as the date helpers.

/** A non-breaking space: a number never wraps away from its unit. */
const NBSP = " "

/** The UI language the unit words follow: German or English. */
function unitLanguage(): "de" | "en" {
  return current?.language.toLowerCase().startsWith("de") ? "de" : "en"
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * A number in the view's locale ("1.234,5" / "1,234.5"); em-dash for
 * null/undefined/NaN/±Infinity. `options` are passed to `Intl.NumberFormat`.
 */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (!isNumber(value)) return EMPTY
  return new Intl.NumberFormat(current?.locale, options).format(value)
}

/** Fraction digits and sign of {@link formatPercent} / {@link formatPercentPoints}. */
export interface PercentFormatOptions {
  /** Default 1, raised to `minimumFractionDigits` when that is larger. */
  maximumFractionDigits?: number
  /** Default 0 — set it equal to the maximum for aligned table columns. */
  minimumFractionDigits?: number
  /** Show "+" for a positive value (deltas). */
  signed?: boolean
}

function percentOptions(
  options: PercentFormatOptions | undefined,
  signedDefault: boolean,
): Intl.NumberFormatOptions {
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0
  return {
    // Intl throws a RangeError for a maximum below the minimum; a formatter
    // runs during render, so it never may.
    maximumFractionDigits: Math.max(options?.maximumFractionDigits ?? 1, minimumFractionDigits),
    minimumFractionDigits,
    signDisplay: (options?.signed ?? signedDefault) ? "exceptZero" : "auto",
  }
}

/**
 * A value in PERCENT units (3.7 means 3.7 %) in the view's locale:
 * "3,7 %" in German, "3.7%" in English. Em-dash for a missing value.
 */
export function formatPercent(
  percent: number | null | undefined,
  options?: PercentFormatOptions,
): string {
  if (!isNumber(percent)) return EMPTY
  return new Intl.NumberFormat(current?.locale, {
    style: "percent",
    ...percentOptions(options, false),
  }).format(percent / 100)
}

/**
 * A difference of two percentages in percentage points, signed by default:
 * "+0,2 Pp." in German, "+0.2 pp" in English.
 */
export function formatPercentPoints(
  points: number | null | undefined,
  options?: PercentFormatOptions,
): string {
  if (!isNumber(points)) return EMPTY
  const n = new Intl.NumberFormat(current?.locale, percentOptions(options, true)).format(points)
  return `${n}${NBSP}${unitLanguage() === "de" ? "Pp." : "pp"}`
}

const PERIOD_UNITS: Record<"de" | "en", Record<string, [one: string, other: string]>> = {
  en: { m: ["minute", "minutes"], h: ["hour", "hours"], d: ["day", "days"], w: ["week", "weeks"] },
  de: {
    m: ["Minute", "Minuten"],
    h: ["Stunde", "Stunden"],
    d: ["Tag", "Tage"],
    w: ["Woche", "Wochen"],
  },
}

/**
 * A look-back period token ("7d", "24h", "30m", "2w") as words in the view's
 * language: "7 Tage" / "7 days", "1 Stunde" / "1 hour". Anything that is not
 * such a token comes back unchanged; empty input renders the em-dash.
 */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return EMPTY
  const match = /^(\d+)\s*([mhdw])$/i.exec(period.trim())
  if (!match) return period
  const count = Number(match[1])
  const [one, other] = PERIOD_UNITS[unitLanguage()][match[2].toLowerCase()]
  return `${formatNumber(count)}${NBSP}${count === 1 ? one : other}`
}

/** Unit symbols of {@link formatDuration}; German puts a space between number and unit. */
const DURATION_UNITS = {
  en: { ms: "ms", s: "s", min: "m", h: "h", gap: "" },
  de: { ms: "ms", s: "s", min: "Min.", h: "h", gap: NBSP },
} as const

/**
 * Format a millisecond duration compactly in the view's language: English
 * `420ms`, `12s`, `3m 7s`, `1h 24m`; German `420 ms`, `12 s`, `3 Min. 7 s`,
 * `1 h 24 Min.`. Returns an em-dash for null, negative or NaN input;
 * fractional input is rounded to whole ms.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return EMPTY
  const units = DURATION_UNITS[unitLanguage()]
  const part = (n: number, unit: string) => `${formatNumber(n)}${units.gap}${unit}`
  const total = Math.round(ms)
  if (total < 1000) return part(total, units.ms)
  const s = Math.floor(total / 1000)
  if (s < 60) return part(s, units.s)
  const m = Math.floor(s / 60)
  if (m < 60) return `${part(m, units.min)} ${part(s % 60, units.s)}`
  return `${part(Math.floor(m / 60), units.h)} ${part(m % 60, units.min)}`
}

/** Truncate with an ellipsis; em-dash for null/empty input. */
export function truncate(value: string | null | undefined, max: number): string {
  if (!value) return EMPTY
  return value.length > max ? value.slice(0, max) + "…" : value
}
