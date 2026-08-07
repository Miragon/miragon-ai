import { KpiGrid, formatDate, formatTime } from "@miragon-ai/widget-shell/widgets"

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
          tone: resolved ? "success" : "critical",
        },
        {
          label: t("incidentDetail.kpiRetriesLeft"),
          value: data.job?.retries ?? "—",
          tone: data.job && data.job.retries > 0 ? "success" : data.job ? "critical" : undefined,
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
          value: data.historyTotalCount ?? "—",
        },
      ]}
    />
  )
}
