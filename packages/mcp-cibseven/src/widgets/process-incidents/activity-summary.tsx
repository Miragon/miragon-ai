import { CountPill } from "@miragon-ai/widget-shell/widgets"

import type { ProcessIncidentsActivity } from "@miragon-ai/client-cibseven"

import { formatTimestamp } from "../../lib/format-time.js"

export function ActivitySummary({
  activity,
  expanded,
}: {
  activity: ProcessIncidentsActivity
  expanded: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 ${
        expanded ? "border-line border-b" : ""
      }`}
    >
      <div className="bg-critical-soft text-critical grid size-6 place-items-center rounded-md text-xs font-bold">
        !
      </div>
      <div className="min-w-0">
        <div className="text-ink truncate text-sm font-semibold">
          {activity.activityName ?? activity.activityId}
        </div>
        <div className="text-ink-muted truncate font-mono text-xs">
          {activity.representativeMessage ?? activity.activityId}
        </div>
      </div>
      <div className="text-ink-muted min-w-[80px] text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">{formatTimestamp(activity.firstSeen)}</div>
        <div>first seen</div>
      </div>
      <div className="text-ink-muted min-w-[80px] text-right text-xs tabular-nums">
        <div className="text-ink font-semibold">{formatTimestamp(activity.latestIncident)}</div>
        <div>latest</div>
      </div>
      <CountPill tone="critical">{activity.incidentCount}</CountPill>
      <span
        aria-hidden="true"
        className={`text-ink-subtle inline-block w-3 text-center text-xs transition-transform ${
          expanded ? "rotate-90" : ""
        }`}
      >
        ▶
      </span>
    </div>
  )
}
