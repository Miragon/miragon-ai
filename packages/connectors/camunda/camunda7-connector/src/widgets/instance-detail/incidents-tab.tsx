import type { InstanceDetailData } from "../../view-models.js"
import { IncidentTable } from "../process-incidents/incident-table.js"
import type { IncidentRecoveryState } from "../process-incidents/use-incident-recovery.js"
import { useNav } from "../navigation.js"
import { useT } from "../../messages/use-t.js"

/** The "Incidents" tab body. */
export function IncidentsTab({
  incidents,
  recovery,
  engine,
}: {
  incidents: InstanceDetailData["incidents"]
  /** Row actions + their optimistic state (`useIncidentRecovery`). */
  recovery: IncidentRecoveryState
  /** The instance's engine, pinned into the rows' AI handoffs. */
  engine?: string
}) {
  const t = useT()
  const go = useNav()
  if ((incidents ?? []).length === 0) {
    return <p className="text-muted-foreground text-sm">{t("instanceDetail.noIncidents")}</p>
  }
  /* Same IncidentTable as the definition view — an incident looks
      identical on both pages. All rows belong to this instance, so
      the instance column is dropped. */
  return (
    <IncidentTable
      incidents={incidents ?? []}
      recovery={recovery}
      onAnalyze={(incidentId) => go({ type: "incident-detail", incidentId })}
      hideInstanceColumn
      previewCount={5}
      engine={engine}
    />
  )
}
