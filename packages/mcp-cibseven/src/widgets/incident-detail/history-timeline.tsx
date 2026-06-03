import { Alert, AlertDescription, Badge } from "@miragon/mcp-toolkit-ui"

import type { IncidentDetailHistoryEntry } from "@miragon-ai/client-cibseven"

import { formatDuration, formatTimestamp } from "../../lib/format-time.js"

export function HistoryTimeline({ entries }: { entries: IncidentDetailHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <Alert>
        <AlertDescription>No history events for this instance</AlertDescription>
      </Alert>
    )
  }
  return (
    <div
      role="table"
      aria-label="Activity history timeline for this process instance"
      className="border-border rounded-lg border"
    >
      <div
        role="row"
        className="border-border text-muted-foreground bg-muted grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide"
      >
        <span role="columnheader">Activity</span>
        <span role="columnheader" className="text-right">
          Started
        </span>
        <span role="columnheader" className="text-right">
          Duration
        </span>
        <span role="columnheader" className="text-right">
          Status
        </span>
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          role="row"
          className="border-border hover:bg-card grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-2 text-sm last:border-b-0"
        >
          <div className="min-w-0">
            <div className="text-foreground truncate font-medium">
              {entry.activityName ?? entry.activityId}
            </div>
            <div className="text-muted-foreground truncate font-mono text-xs">
              {entry.activityType}
            </div>
          </div>
          <span className="text-muted-foreground text-right font-mono text-xs">
            {formatTimestamp(entry.startTime)}
          </span>
          <span className="text-muted-foreground text-right font-mono text-xs">
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
