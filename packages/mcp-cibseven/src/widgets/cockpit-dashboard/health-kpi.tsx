import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { AskAiButton, KpiGrid, WidgetHeader, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { buildRows } from "./lib.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

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
  const t = useT()

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
        {loading ? t("cockpitHealth.loading") : t("cockpitHealth.noData")}
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
        title={t("cockpitHealth.title")}
        sub={
          <span>
            {t("cockpitHealth.subSummary", {
              count: summary.totalDefinitions,
              unit:
                summary.totalDefinitions === 1
                  ? t("cockpitHealth.processUnitSingular")
                  : t("cockpitHealth.processUnitPlural"),
            })}
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
        header={{
          label: t("cockpitHealth.gridLabel"),
          badge: t("cockpitHealth.gridBadge"),
        }}
        cells={[
          {
            label: t("cockpitHealth.cellTotalProcesses"),
            value: summary.totalDefinitions,
            onClick: () => go({ type: "process-list" }),
            ariaLabel: t("cockpitHealth.cellTotalProcessesAria"),
          },
          {
            label: t("cockpitHealth.cellHealthy"),
            value: healthyCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: healthyCount > 0 ? "success" : undefined,
          },
          {
            label: t("cockpitHealth.cellAffected"),
            value: affectedCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: affectedCount > 0 ? "critical" : undefined,
          },
          {
            label: t("cockpitHealth.cellOpenIncidents"),
            value: summary.totalIncidents,
            tone: summary.totalIncidents > 0 ? "critical" : undefined,
            onClick: () => go({ type: "incidents" }),
            ariaLabel: t("cockpitHealth.cellOpenIncidentsAria"),
          },
        ]}
      />
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
