import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { TONE_DOT, AskAiButton } from "@miragon-ai/widget-shell/widgets"
import type { HistoryTimelineData } from "@miragon-ai/client-cibseven"

export type { HistoryTimelineData }
export type HistoryActivity = HistoryTimelineData["activities"][number]

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

function formatDuration(ms: number | null): string {
  if (ms == null) return "running"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

/**
 * Shell-less activity timeline. Reused as the standalone history widget and as a
 * lazily-loaded "Audit log" section inside the instance detail. Pass
 * `processInstance` to show the summary header (omitted when embedded).
 */
export function HistoryTimelineView({
  activities,
  processInstance,
  engineId,
  totalActivities,
}: {
  activities: HistoryActivity[]
  processInstance?: HistoryTimelineData["processInstance"]
  engineId?: string
  totalActivities?: number
}) {
  if (activities.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity history.</p>
  }

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
              <span>Started {new Date(processInstance.startTime).toLocaleString()}</span>
              {processInstance.durationInMillis != null && (
                <span>Duration: {formatDuration(processInstance.durationInMillis)}</span>
              )}
            </div>
          </div>
          <AskAiButton
            variant="primary"
            prompt={`Explain why historic process instance ${processInstance.id} of ${processInstance.processDefinitionName ?? processInstance.processDefinitionKey} (key ${processInstance.processDefinitionKey}) on engine ${engineId} took ${processInstance.durationInMillis}ms end-to-end and is in state ${processInstance.state}, across ${totalActivities ?? activities.length} activities. Use camunda7_query_historic_activity_instances for instance ${processInstance.id} to get the full per-activity timeline, identify the single longest-running step (call out wait time at userTask/receiveTask vs. compute time at serviceTask), and check whether that step is normal by comparing against the definition with analytics_element_bottleneck / analytics_analyze_process_performance for processDefinitionKey ${processInstance.processDefinitionKey}. Conclude with the bottleneck activity and whether this instance is an outlier.`}
          />
        </div>
      )}

      <ol className="flex flex-col gap-1" aria-label="Activity history timeline">
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
                      {formatDuration(activity.durationInMillis)}
                    </span>
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

export function HistoryTimelineWidget({ data }: { data: HistoryTimelineData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground p-6">
      <HistoryTimelineView
        activities={data.activities}
        processInstance={data.processInstance}
        engineId={data.engineId}
        totalActivities={data.totalActivities}
      />
    </div>
  )
}
