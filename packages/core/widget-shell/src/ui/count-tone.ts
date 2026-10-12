import type { ToneVariant } from "@miragon/mcp-toolkit-ui"

/**
 * THE severity ladder of every incident and job count, in every module
 * (#322 U14, decision f; CLAUDE.md "a status is a tone"): an open incident or
 * a job without retries left (the engine's `failedJobs`, analytics' dead
 * jobs) is a state, `danger` while there is any; every other count (running
 * instances, a backlog, what happened in a period) carries no tone. Warning
 * belongs to what can still recover on its own (a degraded verdict, a failed
 * job with retries left), never to these counts. One sign, one meaning: the
 * camunda7 cockpit and the analytics tables on the same page say it alike.
 */

/** An open-incident or no-retries count's tone: danger while there is any, else a neutral number. */
export function countTone(count: number | null | undefined): ToneVariant {
  return (count ?? 0) > 0 ? "danger" : "neutral"
}

/**
 * One process's or engine's state on the ladder: danger while it has an open
 * incident or a job without retries; neutral when nothing runs on it (never
 * a green "healthy" over an idle deployment); otherwise success.
 */
export function severityTone(
  failedJobs: number,
  totalIncidents: number,
  instances: number,
): ToneVariant {
  if (totalIncidents > 0 || failedJobs > 0) return "danger"
  if (instances === 0) return "neutral"
  return "success"
}
