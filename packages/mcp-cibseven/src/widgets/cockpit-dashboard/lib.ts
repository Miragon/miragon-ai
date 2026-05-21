import type { ToneVariant } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData, DefinitionStat } from "@miragon-ai/client-cibseven"

export interface DefinitionRow extends DefinitionStat {
  totalIncidents: number
  tone: ToneVariant
}

export function severityTone(
  failedJobs: number,
  totalIncidents: number,
  instances: number,
): ToneVariant {
  if (totalIncidents > 0) return "critical"
  if (failedJobs > 0) return "warning"
  // Deployed but unused — show neutrally instead of green-flagging as healthy.
  if (instances === 0) return "neutral"
  return "success"
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
