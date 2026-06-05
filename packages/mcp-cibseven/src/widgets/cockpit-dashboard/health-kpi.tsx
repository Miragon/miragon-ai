import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { AskAiButton, KpiGrid, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { buildRows } from "./lib.js"
import { useNav, type NavIntent } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

// Operations areas reachable from the cockpit that don't have their own KPI
// number above (incidents + process list are wired onto the KPI cells instead).
const NAV: Array<{ label: string; icon: string; intent: NavIntent }> = [
  { label: "Jobs", icon: "⚙", intent: { type: "jobs" } },
]

/**
 * Shell-less health overview. One component, two modes: standalone the agent's
 * data is handed in via `data`; in the cockpit only `engine` is passed and the
 * view self-fetches (deduped with the sibling definitions table under a shared
 * key). Navigation flows through {@link useNav} — client-side in the cockpit, a
 * host follow-up standalone.
 */
export function ProcessHealthKpiView({
  data: initialData = null,
  engine,
}: {
  data?: CockpitDashboardData | null
  engine?: string
}) {
  const go = useNav()
  const { data, loading, error } = useViewData<CockpitDashboardData>(
    initialData,
    ["camunda7:cockpit-overview", engine ?? null],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
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

  const { summary } = data
  const rows = buildRows(data)
  const healthyCount = rows.filter((r) => r.tone === "success").length
  const affectedCount = rows.filter((r) => r.tone === "critical" || r.tone === "warning").length

  return (
    <>
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
        actions={
          <AskAiButton
            variant="primary"
            prompt={`Triage the CIB Seven process landscape on engine ${engine ?? "the current engine"}. Right now ${summary.totalDefinitions} definitions are deployed with ${summary.totalRunningInstances} running instances, ${summary.totalFailedJobs} failed jobs and ${summary.totalIncidents} open incidents. Use analytics_engine_health (engineId: ${engine ?? "the current engine"}) for the live ops snapshot and analytics_show_failure_dashboard (engineId: ${engine ?? "the current engine"}) to group current failures by incident type, activity and process definition. Then rank the affected process definitions by operational severity (blast radius = running instances x incident concentration), name the single most urgent one, give the most likely root cause, and recommend the first concrete remediation step (batch retry, variable fix, migration, or escalation).`}
          />
        }
      />
      <KpiGrid
        boxed
        header={{ label: "Health", badge: "Status der Prozesslandschaft" }}
        cells={[
          {
            label: "Prozesse gesamt",
            value: summary.totalDefinitions,
            onClick: () => go({ type: "process-list" }),
            ariaLabel: "Show all process definitions",
          },
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
            onClick: () => go({ type: "incidents" }),
            ariaLabel: "Show the incidents dashboard",
          },
        ]}
      />

      <nav aria-label="Cockpit navigation" className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">Jump to</span>
        {NAV.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => go(item.intent)}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2"
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </>
  )
}

export function ProcessHealthKpi({
  data,
  engine,
}: {
  data: CockpitDashboardData | null
  engine?: string
}) {
  return (
    <WidgetShell>
      <ProcessHealthKpiView data={data} engine={engine} />
    </WidgetShell>
  )
}
