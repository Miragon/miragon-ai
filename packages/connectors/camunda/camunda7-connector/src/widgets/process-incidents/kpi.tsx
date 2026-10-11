import {
  KpiGrid,
  ViewDataState,
  WidgetShell,
  formatNumber,
  type KpiCell,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { useT } from "../../messages/use-t.js"
import { diagramActivityFraction } from "./activity-scope.js"
import { useDefinitionData } from "./feed.js"

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
  const { data, loading, error, refetch } = useDefinitionData(
    initialData,
    processDefinitionKey,
    engine,
  )

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncKpi.loading")}
          emptyText={t("procIncKpi.noData")}
          onRetry={refetch}
          retryLabel={t("viewState.retry")}
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
        value: formatNumber(fraction.affected),
        fraction: `/${formatNumber(fraction.total)}`,
        trend:
          fraction.olderVersionsOnly > 0
            ? t("procIncKpi.olderVersionsOnly", { count: formatNumber(fraction.olderVersionsOnly) })
            : undefined,
      }
    : { label: t("procIncKpi.activitiesAffected"), value: formatNumber(data.activities.length) }

  const cells: KpiCell[] = [
    {
      label: t("procIncKpi.running"),
      value: formatNumber(data.runningInstances),
      tone: data.runningInstances > 0 ? "success" : undefined,
      onClick: () =>
        go({ type: "process-instances", processDefinitionKey: data.processDefinitionKey }),
      ariaLabel: t("procIncKpi.runningAria", { name: title }),
    },
    {
      label: t("procIncKpi.openIncidents"),
      value: formatNumber(data.incidentCount),
      tone: data.incidentCount > 0 ? "danger" : undefined,
    },
    {
      label: t("procIncKpi.last24h"),
      value: `+${formatNumber(data.last24hCount)}`,
      tone: data.last24hCount > 0 ? "danger" : undefined,
    },
    {
      label: t("procIncKpi.failedJobs"),
      value: formatNumber(data.failedJobs),
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
