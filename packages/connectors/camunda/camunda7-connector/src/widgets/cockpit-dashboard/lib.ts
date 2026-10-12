import { type ToneVariant } from "@miragon/mcp-toolkit-ui"
import type { CockpitDashboardData, DefinitionStat } from "../../view-models.js"

export interface DefinitionRow extends DefinitionStat {
  totalIncidents: number
  tone: ToneVariant
}

/**
 * THE severity ladder of every incident and job count (#322 U14, CLAUDE.md
 * "a status is a tone"): an open incident or a job without retries left —
 * the engine's `failedJobs` — is danger; a deployment nothing runs on is
 * neutral (never a green "healthy" over an idle engine); otherwise success.
 * Warning belongs to what can still recover on its own (a degraded verdict,
 * a failed job with retries left), never to these counts.
 */
export function severityTone(
  failedJobs: number,
  totalIncidents: number,
  instances: number,
): ToneVariant {
  if (totalIncidents > 0 || failedJobs > 0) return "danger"
  // Deployed but unused — show neutrally instead of green-flagging as healthy.
  if (instances === 0) return "neutral"
  return "success"
}

/** A count's tone on the ladder: danger while there is any, else a neutral number. */
export function countTone(count: number | null | undefined): ToneVariant {
  return (count ?? 0) > 0 ? "danger" : "neutral"
}

export function buildRows(data: CockpitDashboardData): DefinitionRow[] {
  return data.definitions.map((def) => {
    const totalIncidents = def.incidents.reduce((s, i) => s + i.incidentCount, 0)
    return {
      ...def,
      totalIncidents,
      tone: severityTone(def.failedJobs, totalIncidents, def.instances),
    }
  })
}
