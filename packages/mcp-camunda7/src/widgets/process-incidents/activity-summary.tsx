import { formatTimestamp } from "@miragon-ai/widget-shell/widgets"

import type { ProcessIncidentsActivity } from "../../view-models.js"
import { GroupSummaryRow, IncidentGroupIcon } from "../group-summary-row.js"
import { useT } from "../../messages/use-t.js"

export function ActivitySummary({
  activity,
  expanded,
}: {
  activity: ProcessIncidentsActivity
  expanded: boolean
}) {
  const t = useT()
  return (
    <GroupSummaryRow
      icon={<IncidentGroupIcon />}
      title={activity.activityName ?? activity.activityId}
      subline={activity.representativeMessage ?? activity.activityId}
      stats={[
        { value: formatTimestamp(activity.firstSeen), label: t("procIncSummary.firstSeen") },
        { value: formatTimestamp(activity.latestIncident), label: t("procIncSummary.latest") },
      ]}
      count={activity.incidentCount}
      expanded={expanded}
    />
  )
}
