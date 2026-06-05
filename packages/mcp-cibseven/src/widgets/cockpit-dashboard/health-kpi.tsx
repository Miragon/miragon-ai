import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  KpiGrid,
  WidgetHeader,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { buildRows } from "./lib.js"
import { navigateViaHost, type NavIntent, type OnNavigate } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"

// Operations areas reachable from the cockpit that don't have their own KPI
// number above (incidents + process list are wired onto the KPI cells instead).
const NAV: Array<{ label: string; icon: string; intent: NavIntent }> = [
  { label: "Jobs", icon: "⚙", intent: { type: "jobs" } },
]

/**
 * Shell-less health overview. Reused both as the standalone `ProcessHealthKpi`
 * widget and inside the consolidated cockpit app. Navigation intents flow
 * through `onNavigate` when hosted (client-side routing) and fall back to the
 * conversational host bridge when rendered standalone.
 */
export function ProcessHealthKpiView({
  data: initialData = null,
  engineId,
  onNavigate,
}: {
  data?: CockpitDashboardData | null
  engineId?: string
  onNavigate?: OnNavigate
}) {
  const host: HostActions = useHostActions()
  const go: OnNavigate = onNavigate ?? ((intent) => navigateViaHost(host, intent))
  // Self-fetch when hosted in the cockpit app (engineId given, no eager data).
  // The definitions table shares this exact query key, so TanStack dedups both
  // self-fetching siblings to a single network call. Standalone (data via props)
  // keeps the query disabled.
  const query = useToolQuery<CockpitDashboardData>(
    ["camunda7:cockpit-overview", engineId ?? null],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
    { engine: engineId },
    { enabled: !initialData && !!engineId },
  )
  const data = initialData ?? query.data ?? null

  if (!data) {
    if (query.isError) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{query.error?.message ?? "Failed to load."}</AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {!initialData && engineId ? "Loading…" : "No data available"}
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

export function ProcessHealthKpi({ data }: { data: CockpitDashboardData | null }) {
  return (
    <WidgetShell>
      <ProcessHealthKpiView data={data} />
    </WidgetShell>
  )
}
