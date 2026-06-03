import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { KpiGrid, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { buildRows } from "./lib.js"

export function ProcessHealthKpi({ data }: { data: CockpitDashboardData | null }) {
  if (!data) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const { summary } = data
  const rows = buildRows(data)
  const healthyCount = rows.filter((r) => r.tone === "success").length
  const affectedCount = rows.filter((r) => r.tone === "critical" || r.tone === "warning").length

  return (
    <WidgetShell>
      <WidgetHeader
        icon="▦"
        iconTone="info"
        title="Cockpit"
        sub={
          <span>
            Übersicht aller Prozesse · {summary.totalDefinitions}{" "}
            {summary.totalDefinitions === 1 ? "Prozess" : "Prozesse"}
          </span>
        }
      />
      <KpiGrid
        boxed
        header={{ label: "Health", badge: "Status der Prozesslandschaft" }}
        cells={[
          { label: "Prozesse gesamt", value: summary.totalDefinitions },
          {
            label: "Healthy",
            value: healthyCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: healthyCount > 0 ? "success" : undefined,
          },
          {
            label: "Affected",
            value: affectedCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: affectedCount > 0 ? "critical" : undefined,
          },
          {
            label: "Open Incidents",
            value: summary.totalIncidents,
            tone: summary.totalIncidents > 0 ? "critical" : undefined,
          },
        ]}
      />
    </WidgetShell>
  )
}
