import { Badge } from "@miragon/mcp-toolkit-ui"

import type { IncidentDetailHistoryEntry } from "@miragon-ai/client-cibseven"

import { formatDuration, formatTimestamp } from "../../lib/format-time.js"

export function HistoryTimeline({ entries }: { entries: IncidentDetailHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No history events for this instance</p>
  }
  return (
    <div className="border-line rounded-lg border">
      <div className="border-line text-ink-subtle bg-bg grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
        <span>Activity</span>
        <span className="text-right">Started</span>
        <span className="text-right">Duration</span>
        <span className="text-right">Status</span>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="border-line-soft hover:bg-card grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-2 text-sm last:border-b-0"
        >
          <div className="min-w-0">
            <div className="text-ink truncate font-medium">
              {entry.activityName ?? entry.activityId}
            </div>
            <div className="text-ink-muted truncate font-mono text-xs">{entry.activityType}</div>
          </div>
          <span className="text-ink-muted text-right font-mono text-xs">
            {formatTimestamp(entry.startTime)}
          </span>
          <span className="text-ink-muted text-right font-mono text-xs">
            {formatDuration(entry.durationInMillis)}
          </span>
          <span className="text-right">
            {entry.canceled ? (
              <Badge variant="secondary">canceled</Badge>
            ) : entry.endTime ? (
              <Badge variant="secondary">completed</Badge>
            ) : (
              <Badge variant="default">running</Badge>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
