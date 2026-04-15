import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

interface ActivityData {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  assignee: string | null
  taskId: string | null
}

interface HistoricProcessInstance {
  id: string
  processDefinitionKey: string
  processDefinitionName: string | null
  startTime: string
  endTime: string | null
  durationInMillis: number | null
  state: string
}

export interface HistoryTimelineData {
  processInstance: HistoricProcessInstance | null
  activities: ActivityData[]
  totalActivities: number
}

const ACTIVITY_COLORS: Record<string, string> = {
  startEvent: "bg-green-500",
  endEvent: "bg-red-500",
  userTask: "bg-blue-500",
  serviceTask: "bg-purple-500",
  sendTask: "bg-indigo-500",
  receiveTask: "bg-teal-500",
  exclusiveGateway: "bg-yellow-500",
  parallelGateway: "bg-orange-500",
  inclusiveGateway: "bg-amber-500",
  callActivity: "bg-cyan-500",
  subProcess: "bg-pink-500",
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "running"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

export function HistoryTimelineWidget({ data }: { data: HistoryTimelineData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { processInstance, activities } = data

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      {processInstance && (
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
      )}

      <div className="flex flex-col gap-1">
        {activities.map((activity, index) => {
          const color = ACTIVITY_COLORS[activity.activityType] ?? "bg-gray-400"
          return (
            <div key={activity.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`size-3 rounded-full ${color}`} />
                {index < activities.length - 1 && <div className="bg-border h-6 w-0.5" />}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
