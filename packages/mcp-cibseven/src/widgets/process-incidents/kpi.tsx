import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

export function ProcessIncidentKpi({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )

  if (!data) {
    return (
      <WidgetShell>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground p-2 text-sm">
            {loading ? "Loading…" : "No data available"}
          </div>
        )}
      </WidgetShell>
    )
  }

  const affectedActivityCount = data.activities.length
  const totalActivityFraction =
    data.totalActivityCount !== null
      ? `${affectedActivityCount}/${data.totalActivityCount}`
      : `${affectedActivityCount}`

  return (
    <WidgetShell>
      <KpiGrid
        boxed
        header={{ label: "Overview", badge: "Incidents in diesem Prozess" }}
        cells={[
          {
            label: "Open incidents",
            value: data.incidentCount,
            tone: data.incidentCount > 0 ? "critical" : undefined,
          },
          { label: "Activities affected", value: totalActivityFraction },
          {
            label: "+24h",
            value: `+${data.last24hCount}`,
            tone: data.last24hCount > 0 ? "critical" : undefined,
          },
          {
            label: "Running",
            value: data.runningInstances !== null ? data.runningInstances.toLocaleString() : "—",
            tone:
              data.runningInstances !== null && data.runningInstances > 0 ? "success" : undefined,
          },
        ]}
      />
    </WidgetShell>
  )
}
