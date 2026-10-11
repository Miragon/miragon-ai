import { useMemo } from "react"
import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import {
  HandOffButton,
  TONE_DOT,
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
import { useHandOff, type HandOff, type ViewContext } from "./lib/hand-off.js"
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
// success/danger tones; the remaining categories use a distinct, deduplicated
// palette (an explicit-color set, like the heatmap legend) kept readable in both
// light and dark mode.
const ACTIVITY_COLORS: Record<string, string> = {
  startEvent: TONE_DOT.success,
  endEvent: TONE_DOT.danger,
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

type TimelineInstance = NonNullable<HistoryTimelineData["processInstance"]>

/**
 * Where did this historic instance spend its time — the whole run, against
 * its definition's metrics baseline (analytics, when active). The baseline is
 * read by key — an argument the history query refuses — so the key goes with
 * the analytics tools (here and below).
 */
export function explainInstanceHandOff(
  instance: TimelineInstance,
  engineId: string | undefined,
  activityCount: number,
): HandOff {
  return {
    intent: "askAi.history.explainInstance",
    ids: {
      engine: engineId,
      processInstanceId: instance.id,
    },
    toolIds: {
      analytics_element_bottleneck: { processDefinitionKey: instance.processDefinitionKey },
      analytics_analyze_process_performance: {
        processDefinitionKey: instance.processDefinitionKey,
      },
    },
    facts: { durationMs: instance.durationInMillis, state: instance.state, activityCount },
    untrusted: [{ label: "processName", text: instance.processDefinitionName }],
    tools: [
      "camunda7_query_historic_activity_instances",
      "analytics_element_bottleneck",
      "analytics_analyze_process_performance",
    ],
  }
}

/** Why ONE step took this long — the outlier row's hand-off. */
export function explainActivityHandOff(
  activity: HistoryEntry,
  instance: TimelineInstance | null | undefined,
  engineId: string | undefined,
): HandOff {
  return {
    intent: "askAi.history.explainActivity",
    ids: {
      engine: engineId,
      processInstanceId: instance?.id,
      activityId: activity.activityId,
    },
    toolIds: {
      analytics_element_bottleneck: { processDefinitionKey: instance?.processDefinitionKey },
      analytics_analyze_process_performance: {
        processDefinitionKey: instance?.processDefinitionKey,
      },
    },
    facts: { durationMs: activity.durationInMillis, activityType: activity.activityType },
    untrusted: [{ label: "activityName", text: activity.activityName }],
    tools: [
      "camunda7_query_historic_activity_instances",
      "analytics_element_bottleneck",
      "analytics_analyze_process_performance",
    ],
  }
}

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
  const { ask } = useHandOff()
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

  // Duration outliers: only surface the per-row "explain duration" hand-off
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
          <HandOffButton
            action="explainTimeline"
            variant="primary"
            prompt={ask(
              explainInstanceHandOff(
                processInstance,
                engineId,
                totalActivities ?? activities.length,
              ),
            )}
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
                      <span className="text-info-ink ml-2 text-xs">@{activity.assignee}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {activity.durationInMillis == null
                        ? t("incidentHistory.statusRunning")
                        : formatDuration(activity.durationInMillis)}
                    </span>
                    {isOutlier(activity.durationInMillis) && (
                      <HandOffButton
                        action="explainDuration"
                        variant="icon"
                        prompt={ask(explainActivityHandOff(activity, processInstance, engineId))}
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

/** One page of the history query, in its envelope shape. */
interface HistoryPage {
  items?: HistoryEntry[]
  totalCount?: number
}

/**
 * Offset-paged entry into the history family: pages the registrar history
 * query with the house Load-more pattern (usePagedViewData + ListFooter)
 * instead of one capped fetch. Self-fetching in the instance detail's audit
 * tab (`variant="timeline"`) and the incident detail's history tab
 * (`variant="table"`), which both mount lazily on first tab activation; the
 * standalone timeline hands in the show tool's first page (`initialPage`) and
 * its instance header.
 */
export function PagedHistoryView({
  processInstanceId,
  engine,
  variant = "timeline",
  initialPage = null,
  processInstance,
}: {
  processInstanceId: string
  /** Explicit engine routing; omitted → the caller's saved default engine. */
  engine?: string
  variant?: "timeline" | "table"
  /** Page 0 handed in (no self-fetch); "Load more" continues after it. */
  initialPage?: HistoryPage | null
  /** Instance summary header (timeline variant only). */
  processInstance?: HistoryTimelineData["processInstance"]
}) {
  const t = useT()
  const args: Record<string, unknown> = {
    processInstanceId,
    sortBy: "startTime",
    sortOrder: "asc",
  }
  if (engine) args.engine = engine
  const paged = usePagedViewData<HistoryEntry, HistoryPage>({
    initialData: initialPage,
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
            {t("historyTimeline.loadError", {
              message: paged.error.message || t("viewState.unknownError"),
            })}
          </AlertDescription>
        </Alert>
      )
    }
    return <p className="text-muted-foreground text-sm">{t("historyTimeline.loading")}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <HistoryTimelineView
        variant={variant}
        activities={paged.items}
        processInstance={processInstance}
        engineId={engine}
        totalActivities={paged.total}
      />
      <CockpitListFooter paged={paged} noun={t("historyTimeline.footerNoun")} />
    </div>
  )
}

/**
 * The standalone timeline (`camunda7_show_history_timeline`). The show tool
 * returns one capped page — the model may read it whole — so the rest of a
 * long instance is a "Load more" away on the same engine, never a silently
 * cut timeline.
 */
/**
 * The timeline the operator is looking at, with the definition baseline
 * (analytics, when active) for the "is this normal" follow-up. Rendered
 * in-component — the tool list follows the live surface.
 */
export function describeHistoryTimeline(data: HistoryTimelineData): ViewContext {
  const pi = data.processInstance
  return {
    summary: pi
      ? "The operator is viewing the activity history timeline of one process instance."
      : "The operator is viewing an activity history timeline.",
    ids: {
      engine: data.engineId,
      processInstanceId: pi?.id,
    },
    toolIds: { analytics_element_bottleneck: { processDefinitionKey: pi?.processDefinitionKey } },
    facts: {
      state: pi?.state,
      activities: data.totalActivities,
      startTime: pi?.startTime,
      endTime: pi?.endTime,
      stillRunning: pi ? pi.endTime === null : undefined,
    },
    untrusted: [{ label: "processName", text: pi?.processDefinitionName }],
    tools: ["camunda7_query_historic_activity_instances", "analytics_element_bottleneck"],
  }
}

function HistoryModelContext({ data }: { data: HistoryTimelineData }) {
  const { context } = useHandOff()
  return (
    <HostModelContext content={context(describeHistoryTimeline(data))}>{null}</HostModelContext>
  )
}

export function HistoryTimelineWidget({ data }: { data: HistoryTimelineData | null }) {
  const t = useT()
  // Stable identity per payload: the paged hook resets on a new page 0.
  const initialPage = useMemo<HistoryPage | null>(
    () => (data ? { items: data.activities, totalCount: data.totalActivities } : null),
    [data],
  )
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
      <HistoryModelContext data={data} />
      {data.processInstance ? (
        <PagedHistoryView
          processInstanceId={data.processInstance.id}
          engine={data.engineId}
          initialPage={initialPage}
          processInstance={data.processInstance}
        />
      ) : (
        // Unknown to history: nothing to page (and no id to scope a page by).
        <HistoryTimelineView
          activities={data.activities}
          engineId={data.engineId}
          totalActivities={data.totalActivities}
        />
      )}
    </WidgetShell>
  )
}
