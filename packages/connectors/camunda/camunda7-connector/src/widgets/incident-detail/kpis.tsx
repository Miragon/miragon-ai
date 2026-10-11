import { KpiGrid, formatDate, formatNumber, formatTime } from "@miragon-ai/widget-shell/widgets"

import type { IncidentDetailData } from "../../view-models.js"

import { useT } from "../../messages/use-t.js"

export function IncidentKpis({ data, resolved }: { data: IncidentDetailData; resolved: boolean }) {
  const t = useT()
  return (
    <KpiGrid
      boxed
      header={{
        label: t("incidentDetail.kpiHeaderLabel"),
        badge: t("incidentDetail.kpiHeaderBadge"),
      }}
      cells={[
        {
          label: t("incidentDetail.kpiType"),
          value: data.incidentType,
          tone: resolved ? "success" : "danger",
        },
        {
          label: t("incidentDetail.kpiRetriesLeft"),
          value: formatNumber(data.job?.retries),
          tone: data.job && data.job.retries > 0 ? "success" : data.job ? "danger" : undefined,
        },
        {
          label: t("incidentDetail.kpiDate"),
          value: formatDate(data.incidentTimestamp),
        },
        {
          label: t("incidentDetail.kpiTime"),
          value: formatTime(data.incidentTimestamp),
        },
        {
          label: t("incidentDetail.kpiHistoryEvents"),
          value: formatNumber(data.historyTotalCount),
        },
      ]}
    />
  )
}
