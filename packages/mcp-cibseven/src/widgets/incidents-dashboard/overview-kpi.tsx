import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  KpiGrid,
  LivePill,
  WidgetHeader,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { IncidentsDashboardData } from "@miragon-ai/client-cibseven"
import { CAMUNDA7_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

/** Shell-less incidents KPI header. Reused standalone and in the cockpit app. */
export function IncidentOverviewKpiView({
  data: initialData = null,
  engine,
}: {
  data?: IncidentsDashboardData | null
  engine?: string
}) {
  // Shares the process-list query key → both incidents panels dedupe to one
  // fetch in the cockpit; standalone the data comes in via props.
  const { data, loading, error } = useViewData<IncidentsDashboardData>(
    initialData,
    ["camunda7:incidents", engine ?? null],
    CAMUNDA7_INCIDENTS_DATA,
    { engine },
    !!engine,
  )

  if (!data) {
    if (error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {loading ? "Loading…" : "No data available"}
      </div>
    )
  }

  const engineId = engine ?? data.engineId ?? "default"

  return (
    <>
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
        actions={
          <AskAiButton
            variant="primary"
            prompt={`Triage all open incidents in the CIB Seven cockpit for engine ${engineId}. There are currently ${data.totalCount} open incidents across ${data.processCount} process(es) affecting ${data.affectedActivityCount} activities, with ${data.last24hCount} new in the last 24h (last event ${formatTimestamp(data.latestIncident)}). Use camunda7_list_incidents and camunda7_query_historic_activity_instances to cluster the incidents by exception/error message and failing activity, rank the clusters by impact (incident count and 24h growth), identify the single most likely systemic root cause, and tell me which process(es) and activities to address first. For each top cluster recommend a concrete next step (batch job retry via camunda7_set_job_retries_batch, a variable fix, an instance modification, or escalation). Do not change anything yet — return a prioritized triage plan.`}
          />
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
    </>
  )
}

export function IncidentOverviewKpi({
  data,
  engine,
}: {
  data: IncidentsDashboardData | null
  engine?: string
}) {
  return (
    <WidgetShell>
      <IncidentOverviewKpiView data={data} engine={engine} />
    </WidgetShell>
  )
}
