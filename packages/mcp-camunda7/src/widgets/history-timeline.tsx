import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  TONE_DOT,
  AskAiButton,
  ListTable,
  TableEmptyState,
  Td,
  WidgetShell,
  formatDuration,
  formatTimestamp,
  usePagedViewData,
} from "@miragon-ai/widget-shell/widgets"
import type { HistoryTimelineData } from "../view-models.js"
import { CockpitListFooter } from "./list-footer.js"
import { useT } from "../messages/use-t.js"

export type { HistoryTimelineData }
export type HistoryActivity = HistoryTimelineData["activities"][number]

/**
 * Row contract of the history family — the one shape every historic-activity
 * rendering in this module shares. Raw `ActivityData` rows (historic activity
 * instances, also the `camunda7_query_historic_activity_instances` page items)
 * satisfy it structurally, so either source renders through
 * {@link HistoryTimelineView} without mapping.
 */
export interface HistoryEntry {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  assignee?: string | null
  canceled?: boolean
}

// Categorical dot colors per BPMN activity type. Start/end map to the brand
// success/critical tones; the remaining categories use a distinct, deduplicated
// palette (an explicit-color set, like the heatmap legend) kept readable in both
// light and dark mode.
const ACTIVITY_COLORS: Record<string, string> = {
  startEvent: TONE_DOT.success,
  endEvent: TONE_DOT.critical,
  userTask: "bg-blue-500 dark:bg-blue-400",
  serviceTask: "bg-purple-500 dark:bg-purple-400",
  sendTask: "bg-indigo-500 dark:bg-indigo-400",
  receiveTask: "bg-teal-500 dark:bg-teal-400",
  exclusiveGateway: "bg-yellow-500 dark:bg-yellow-400",
  parallelGateway: "bg-orange-500 dark:bg-orange-400",
  inclusiveGateway: "bg-amber-500 dark:bg-amber-400",
  callActivity: "bg-cyan-500 dark:bg-cyan-400",
  subProcess: "bg-pink-500 dark:bg-pink-400",
}
const ACTIVITY_COLOR_FALLBACK = TONE_DOT.neutral

/**
 * Compact table look of the family: a real `<table>` (kit `Th`/`Td`) with
 * Started / Duration / Status columns for dense embeddings (the incident
 * detail's history tab). Same {@link HistoryEntry} rows and shared format
 * helpers as the rich timeline.
 */
function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  const t = useT()
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      {/* Compact variant: py-2 overrides Td/Th's default padding, the wrapper
          border replaces the header's own top edge, and the activity cell takes
          the remaining width (w-full max-w-0) so long names truncate instead of
          widening the table into horizontal scroll. */}
      <ListTable
        className="[&_th]:border-t-0"
        ariaLabel={t("incidentHistory.tableAriaLabel")}
        columns={[
          { label: t("incidentHistory.columnActivity"), className: "py-2" },
          { label: t("incidentHistory.columnStarted"), align: "right", className: "py-2" },
          { label: t("incidentHistory.columnDuration"), align: "right", className: "py-2" },
          { label: t("incidentHistory.columnStatus"), align: "right", className: "py-2" },
        ]}
      >
        {entries.map((entry) => (
          <tr key={entry.id} className="hover:bg-card [&:last-child>td]:border-b-0">
            <Td className="w-full max-w-0 py-2">
              <div className="text-foreground truncate font-medium">
                {entry.activityName ?? entry.activityId}
              </div>
              <div className="text-muted-foreground truncate font-mono text-xs">
                {entry.activityType}
              </div>
            </Td>
            <Td align="right" className="text-muted-foreground py-2 font-mono text-xs">
              {formatTimestamp(entry.startTime)}
            </Td>
            <Td align="right" className="text-muted-foreground py-2 font-mono text-xs">
              {formatDuration(entry.durationInMillis)}
            </Td>
            <Td align="right" className="py-2">
              {entry.canceled ? (
                <Badge variant="secondary">{t("incidentHistory.statusCanceled")}</Badge>
              ) : entry.endTime ? (
                <Badge variant="secondary">{t("incidentHistory.statusCompleted")}</Badge>
              ) : (
                <Badge variant="default">{t("incidentHistory.statusRunning")}</Badge>
              )}
            </Td>
          </tr>
        ))}
      </ListTable>
    </div>
  )
}

/**
 * Shell-less activity history — THE component family for historic activity
 * instances. Two variants of the same rows and formatting:
 *  - `"timeline"` (default): the rich vertical dot timeline with duration
 *    outlier detection and Ask-AI affordances. Reused as the standalone
 *    history widget and as the lazily-loaded "Audit log" section inside the
 *    instance detail; pass `processInstance` to show the summary header
 *    (omitted when embedded).
 *  - `"table"`: the compact Started/Duration/Status grid used by the incident
 *    detail's history tab.
 */
export function HistoryTimelineView({
  activities,
  processInstance,
  engineId,
  totalActivities,
  variant = "timeline",
}: {
  activities: HistoryEntry[]
  processInstance?: HistoryTimelineData["processInstance"]
  engineId?: string
  totalActivities?: number
  variant?: "timeline" | "table"
}) {
  const t = useT()
  if (activities.length === 0) {
    return (
      <TableEmptyState>
        {variant === "table" ? t("incidentHistory.empty") : t("historyTimeline.empty")}
      </TableEmptyState>
    )
  }

  if (variant === "table") {
    return <HistoryTable entries={activities} />
  }

  // Duration outliers: only surface the per-row "Why so long here?" explain
  // affordance on the slowest step(s) so the timeline isn't cluttered. A row is
  // an outlier if it has the single max duration, or its duration is >= 2x the
  // median of all completed (non-null) durations.
  const durations = activities.map((a) => a.durationInMillis).filter((d): d is number => d != null)
  let outlierThreshold = Infinity
  let maxDuration = -Infinity
  if (durations.length > 0) {
    const sorted = [...durations].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    outlierThreshold = median * 2
    maxDuration = sorted[sorted.length - 1]
  }
  const isOutlier = (ms: number | null): boolean =>
    ms != null && (ms === maxDuration || ms >= outlierThreshold)

  return (
    <div className="flex flex-col gap-4">
      {processInstance && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {processInstance.processDefinitionName ?? processInstance.processDefinitionKey}
            </h2>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 text-sm">
              <Badge variant="secondary">{processInstance.state}</Badge>
              <span>
                {t("historyTimeline.started", {
                  time: formatTimestamp(processInstance.startTime),
                })}
              </span>
              {processInstance.durationInMillis != null && (
                <span>
                  {t("historyTimeline.duration", {
                    duration: formatDuration(processInstance.durationInMillis),
                  })}
                </span>
              )}
            </div>
          </div>
          <AskAiButton
            variant="primary"
            prompt={`Explain why historic process instance ${processInstance.id} of ${processInstance.processDefinitionName ?? processInstance.processDefinitionKey} (key ${processInstance.processDefinitionKey}) on engine ${engineId} took ${processInstance.durationInMillis}ms end-to-end and is in state ${processInstance.state}, across ${totalActivities ?? activities.length} activities. Use camunda7_query_historic_activity_instances for instance ${processInstance.id} to get the full per-activity timeline, identify the single longest-running step (call out wait time at userTask/receiveTask vs. compute time at serviceTask), and check whether that step is normal by comparing against the definition with analytics_element_bottleneck / analytics_analyze_process_performance for processDefinitionKey ${processInstance.processDefinitionKey}. Conclude with the bottleneck activity and whether this instance is an outlier.`}
          />
        </div>
      )}

      <ol className="flex flex-col gap-1" aria-label={t("historyTimeline.timelineLabel")}>
        {activities.map((activity, index) => {
          const color = ACTIVITY_COLORS[activity.activityType] ?? ACTIVITY_COLOR_FALLBACK
          return (
            <li key={activity.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`size-3 rounded-full ${color}`} aria-hidden="true" />
                {index < activities.length - 1 && (
                  <div className="bg-border h-6 w-0.5" aria-hidden="true" />
                )}
              </div>
              <Card className="flex-1 gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">
                      {activity.activityName ?? activity.activityId}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {activity.activityType}
                    </span>
                    {activity.assignee && (
                      <span className="text-info ml-2 text-xs">@{activity.assignee}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {activity.durationInMillis == null
                        ? t("incidentHistory.statusRunning")
                        : formatDuration(activity.durationInMillis)}
                    </span>
                    {isOutlier(activity.durationInMillis) && (
                      <AskAiButton
                        variant="icon"
                        label={t("historyTimeline.whySoLong")}
                        title={t("historyTimeline.whySoLong")}
                        prompt={`Explain in plain language why the activity ${activity.activityName ?? activity.activityId} (id ${activity.activityId}, type ${activity.activityType}) took ${activity.durationInMillis}ms on historic process instance ${processInstance?.id ?? "the current instance"}${engineId ? ` on engine ${engineId}` : " on the current engine"}. Is this wait time (a userTask or receiveTask waiting on a human or message) or compute time (a serviceTask doing work)? Use camunda7_query_historic_activity_instances for this instance to confirm the activity's timing, and cross-check whether this duration is normal for ${activity.activityType} ${activity.activityId} by calling analytics_element_bottleneck and analytics_analyze_process_performance for processDefinitionKey ${processInstance?.processDefinitionKey ?? "this process definition"}. State whether this step is the bottleneck and whether ${activity.durationInMillis}ms is typical or an outlier. Explanation only — do not change anything.`}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Page size for the self-paged history tabs (a timeline rarely exceeds one page). */
const HISTORY_PAGE_SIZE = 100
/** Registrar history query — returns a `{ items, totalCount }` pagination envelope. */
const HISTORY_QUERY_TOOL = "camunda7_query_historic_activity_instances"

/**
 * Self-fetching, offset-paged entry into the history family: pages the
 * registrar history query with the house Load-more pattern (usePagedViewData +
 * ListFooter) instead of one capped fetch. Used by the instance detail's
 * audit tab (`variant="timeline"`) and the incident detail's history tab
 * (`variant="table"`); both mount lazily on first tab activation.
 */
export function PagedHistoryView({
  processInstanceId,
  engine,
  variant = "timeline",
}: {
  processInstanceId: string
  /** Explicit engine routing; omitted → the session's sticky engine. */
  engine?: string
  variant?: "timeline" | "table"
}) {
  const t = useT()
  const args: Record<string, unknown> = {
    processInstanceId,
    sortBy: "startTime",
    sortOrder: "asc",
  }
  if (engine) args.engine = engine
  const paged = usePagedViewData<HistoryEntry, { items?: HistoryEntry[]; totalCount?: number }>({
    initialData: null,
    key: ["camunda7:instance-history", engine ?? null, processInstanceId],
    tool: HISTORY_QUERY_TOOL,
    args,
    pageSize: HISTORY_PAGE_SIZE,
    ready: !!processInstanceId,
    selectItems: (d) => d.items ?? [],
    selectTotal: (d) => d.totalCount ?? 0,
  })

  if (!paged.firstPage) {
    if (paged.error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>
            {paged.error.message || t("historyTimeline.loadError")}
          </AlertDescription>
        </Alert>
      )
    }
    return <p className="text-muted-foreground text-sm">{t("historyTimeline.loading")}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <HistoryTimelineView variant={variant} activities={paged.items} />
      <CockpitListFooter paged={paged} noun={t("historyTimeline.footerNoun")} />
    </div>
  )
}

export function HistoryTimelineWidget({ data }: { data: HistoryTimelineData | null }) {
  const t = useT()
  if (!data) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>{t("historyTimeline.noData")}</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <HistoryTimelineView
        activities={data.activities}
        processInstance={data.processInstance}
        engineId={data.engineId}
        totalActivities={data.totalActivities}
      />
    </WidgetShell>
  )
}
