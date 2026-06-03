import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "@miragon-ai/client-cibseven"

export function ProcessIncidentKpi({ data }: { data: ProcessIncidentsData | null }) {
  if (!data) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
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
