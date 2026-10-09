import type { IncidentRecovery } from "../../view-models.js"

/**
 * An incident's recovery as the widgets read it. The feeds always set
 * `recovery` (the engine contract's `incidentRecovery`), but a result stored
 * before the field existed still reaches the CURRENT view: a reopened
 * conversation hands it the old structuredContent, and a widget fed initial
 * data never refetches. Without the field, the type decides the same way the
 * contract does — a custom incident is resolved; a built-in one (the engine
 * refuses to resolve it) is retried on `jobId` when the old payload names its
 * job, and offers no action otherwise.
 */
export function recoveryOf(
  incident: { incidentType: string; recovery?: IncidentRecovery },
  jobId?: string | null,
): IncidentRecovery {
  if (incident.recovery) return incident.recovery
  switch (incident.incidentType) {
    case "failedJob":
      return jobId ? { action: "retry-job", jobId } : { action: "none" }
    case "failedExternalTask":
      return { action: "none" }
    default:
      return { action: "resolve" }
  }
}
