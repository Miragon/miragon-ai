import type { InstanceDetailData } from "../../view-models.js"
import { IncidentTable, type ResolveError } from "../process-incidents/incident-table.js"
import { useNav } from "../navigation.js"
import { useT } from "../../messages/use-t.js"

/** The "Incidents" tab body. */
export function IncidentsTab({
  incidents,
  resolvedIds,
  pendingIds,
  resolveError,
  onResolve,
}: {
  incidents: InstanceDetailData["incidents"]
  resolvedIds: Set<string>
  pendingIds: Set<string>
  resolveError: ResolveError | null
  onResolve: (incidentId: string) => void
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
      resolvedIds={resolvedIds}
      pendingIds={pendingIds}
      resolveError={resolveError}
      onResolve={onResolve}
      onAnalyze={(incidentId) => go({ type: "incident-detail", incidentId })}
      hideInstanceColumn
      previewCount={5}
    />
  )
}
