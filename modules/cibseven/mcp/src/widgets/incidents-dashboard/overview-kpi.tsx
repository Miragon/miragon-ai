import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, LivePill, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { IncidentsDashboardData } from "@miragon-ai/client-cibseven"

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

export function IncidentOverviewKpi({ data }: { data: IncidentsDashboardData | null }) {
  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader
        icon="⚠"
        iconTone="critical"
        title="Incidents"
        sub={
          <>
            <LivePill>Live</LivePill>
            <span>
              {data.totalCount} open across {data.processCount}{" "}
              {data.processCount === 1 ? "process" : "processes"}
              {data.latestIncident && <> · last event {formatTimestamp(data.latestIncident)}</>}
            </span>
          </>
        }
      />
      <KpiGrid
        boxed
        header={{ label: "Overview", badge: "Open incidents · letzte 24h" }}
        cells={[
          {
            label: "Open Incidents",
            value: data.totalCount,
            tone: data.totalCount > 0 ? "critical" : undefined,
          },
          { label: "Processes affected", value: data.processCount },
          { label: "Activities affected", value: data.affectedActivityCount },
          {
            label: "+24h",
            value: `+${data.last24hCount}`,
            tone: data.last24hCount > 0 ? "critical" : undefined,
          },
        ]}
      />
    </WidgetShell>
  )
}
