import { KpiGrid, ViewDataState, WidgetShell, type KpiCell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useNav } from "../navigation.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

/** The unified definition KPI strip: execution health + incident load in one row. */
export function ProcessDefinitionKpi({
  data: initialData = null,
  processDefinitionKey,
  engine,
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
}) {
  const t = useT()
  const go = useNav()
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
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncKpi.loading")}
          emptyText={t("procIncKpi.noData")}
        />
      </WidgetShell>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const affectedActivityCount = data.activities.length
  const totalActivityFraction =
    data.totalActivityCount !== null
      ? `${affectedActivityCount}/${data.totalActivityCount}`
      : `${affectedActivityCount}`

  const cells: KpiCell[] = [
    {
      label: t("procIncKpi.running"),
      value: data.runningInstances !== null ? data.runningInstances.toLocaleString() : "—",
      tone: data.runningInstances !== null && data.runningInstances > 0 ? "success" : undefined,
      onClick: () =>
        go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey }),
      ariaLabel: t("procIncKpi.runningAria", { name: title }),
    },
    {
      label: t("procIncKpi.openIncidents"),
      value: data.incidentCount,
      tone: data.incidentCount > 0 ? "critical" : undefined,
    },
    {
      label: "+24h",
      value: `+${data.last24hCount}`,
      tone: data.last24hCount > 0 ? "critical" : undefined,
    },
    {
      label: t("procIncKpi.failedJobs"),
      value: data.failedJobs !== null ? data.failedJobs : "—",
      tone: data.failedJobs !== null && data.failedJobs > 0 ? "warning" : undefined,
    },
    { label: t("procIncKpi.activitiesAffected"), value: totalActivityFraction },
  ]

  return (
    <WidgetShell>
      <KpiGrid
        boxed
        header={{ label: t("procIncKpi.overview"), badge: t("procIncKpi.headerBadge") }}
        cells={cells}
      />
    </WidgetShell>
  )
}
