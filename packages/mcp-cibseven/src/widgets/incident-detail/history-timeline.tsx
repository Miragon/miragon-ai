import { Alert, AlertDescription, Badge } from "@miragon/mcp-toolkit-ui"

import type { IncidentDetailHistoryEntry } from "../../view-models.js"

import { formatDuration, formatTimestamp } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../../messages/use-t.js"

export function HistoryTimeline({ entries }: { entries: IncidentDetailHistoryEntry[] }) {
  const t = useT()
  if (entries.length === 0) {
    return (
      <Alert>
        <AlertDescription>{t("incidentHistory.empty")}</AlertDescription>
      </Alert>
    )
  }
  return (
    <div
      role="table"
      aria-label={t("incidentHistory.tableAriaLabel")}
      className="border-border rounded-lg border"
    >
      <div
        role="row"
        className="border-border text-muted-foreground bg-muted grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-wide"
      >
        <span role="columnheader">{t("incidentHistory.columnActivity")}</span>
        <span role="columnheader" className="text-right">
          {t("incidentHistory.columnStarted")}
        </span>
        <span role="columnheader" className="text-right">
          {t("incidentHistory.columnDuration")}
        </span>
        <span role="columnheader" className="text-right">
          {t("incidentHistory.columnStatus")}
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
              <Badge variant="secondary">{t("incidentHistory.statusCanceled")}</Badge>
            ) : entry.endTime ? (
              <Badge variant="secondary">{t("incidentHistory.statusCompleted")}</Badge>
            ) : (
              <Badge variant="default">{t("incidentHistory.statusRunning")}</Badge>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
