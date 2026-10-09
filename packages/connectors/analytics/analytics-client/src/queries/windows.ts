import { RETENTION_DAYS } from "../prometheus.js"

export const DAY_SECONDS = 86_400

/** Now, in epoch seconds — the upper bound of every window. */
export const nowSeconds = () => Math.floor(Date.now() / 1000)

/** An explicit time window after clamping, in epoch seconds. */
export interface ClampedWindow {
  from: number
  to: number
  /** Actual length after clamping. */
  seconds: number
  /** True when clamping cut the requested window short (it reached past now or retention). */
  partial: boolean
}

/**
 * Holds `[from, to]` inside `[now − RETENTION_DAYS, now]`: Prometheus answers
 * a future `@` with whatever exists so far and a pre-retention one with
 * nothing, so an unclamped window silently reads a fraction of its span while
 * being reported at full length. Refuses what no clamp can repair — a
 * reversed or empty window, one entirely in the future or entirely before
 * retention — with a message naming `name`.
 */
export function clampWindow(
  name: string,
  from: number,
  to: number,
  now: number = nowSeconds(),
): ClampedWindow {
  if (to <= from) {
    throw new Error(`${name}: the window ends before it starts — swap from and to`)
  }
  const oldest = now - RETENTION_DAYS * DAY_SECONDS
  if (from >= now) {
    throw new Error(`${name}: the window lies in the future — no metrics exist for it yet`)
  }
  if (to <= oldest) {
    throw new Error(
      `${name}: the window lies before the ${RETENTION_DAYS}-day Prometheus retention — its metrics are gone`,
    )
  }
  const clampedFrom = Math.max(from, oldest)
  const clampedTo = Math.min(to, now)
  return {
    from: clampedFrom,
    to: clampedTo,
    seconds: clampedTo - clampedFrom,
    partial: clampedFrom !== from || clampedTo !== to,
  }
}

/** The PromQL range suffix reading exactly `w`: `[<seconds>s] @ <to>`. */
export const rangeAt = (w: Pick<ClampedWindow, "seconds" | "to">) => `[${w.seconds}s] @ ${w.to}`

/** A window length in days, two decimals (a clamped window is rarely whole days). */
export const daysOf = (seconds: number) => Math.round((seconds / DAY_SECONDS) * 100) / 100

/** ISO timestamp of an epoch-second instant. */
export const isoOf = (seconds: number) => new Date(seconds * 1000).toISOString()
