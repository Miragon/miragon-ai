import { KpiGrid, ViewDataState, WidgetShell, type KpiCell } from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useNav } from "../navigation.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"
import { diagramActivityFraction } from "./activity-scope.js"

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
  const fraction = diagramActivityFraction(data)
  // Both sides of the fraction count the diagram's activities; those only
  // older versions have are named beside it, never folded into it.
  const activitiesCell: KpiCell = fraction
    ? {
        label: t("procIncKpi.activitiesAffected"),
        value: fraction.affected,
        fraction: `/${fraction.total}`,
        trend:
          fraction.olderVersionsOnly > 0
            ? t("procIncKpi.olderVersionsOnly", { count: fraction.olderVersionsOnly })
            : undefined,
      }
    : { label: t("procIncKpi.activitiesAffected"), value: data.activities.length }

  const cells: KpiCell[] = [
    {
      label: t("procIncKpi.running"),
      value: data.runningInstances.toLocaleString(),
      tone: data.runningInstances > 0 ? "success" : undefined,
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
      value: data.failedJobs,
      tone: data.failedJobs > 0 ? "warning" : undefined,
    },
    activitiesCell,
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
