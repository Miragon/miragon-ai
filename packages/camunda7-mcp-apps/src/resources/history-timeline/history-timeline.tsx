import { useToolData, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ActivityData {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  assignee: string | null;
  taskId: string | null;
}

interface HistoricProcessInstance {
  id: string;
  processDefinitionKey: string;
  processDefinitionName: string | null;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  state: string;
}

interface TimelineOutput {
  processInstance: HistoricProcessInstance | null;
  activities: ActivityData[];
  totalActivities: number;
}

export const resource: ResourceConfig = {
  title: 'History Timeline',
  description: 'Color-coded activity timeline for process instances',
};

// Data-visualization dot colors — comparable to shadcn --chart-* tokens.
// Raw colors are acceptable here as these are decorative elements.
const ACTIVITY_COLORS: Record<string, string> = {
  startEvent: 'bg-green-500',
  endEvent: 'bg-red-500',
  userTask: 'bg-blue-500',
  serviceTask: 'bg-purple-500',
  sendTask: 'bg-indigo-500',
  receiveTask: 'bg-teal-500',
  exclusiveGateway: 'bg-yellow-500',
  parallelGateway: 'bg-orange-500',
  inclusiveGateway: 'bg-amber-500',
  callActivity: 'bg-cyan-500',
  subProcess: 'bg-pink-500',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return 'running';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function HistoryTimelineResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, TimelineOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card text-card-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading timeline...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>Failed to load timeline</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert className="bg-warning/10 text-warning-foreground border-warning/30">
          <AlertDescription>Request was cancelled</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!output) return null;

  const { processInstance, activities } = output;

  return (
    <div className="flex flex-col gap-4 p-6 bg-card text-card-foreground">
      {processInstance && (
        <div>
          <h2 className="text-xl font-semibold">
            {processInstance.processDefinitionName ?? processInstance.processDefinitionKey}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
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
          const color = ACTIVITY_COLORS[activity.activityType] ?? 'bg-gray-400';
          return (
            <div key={activity.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`size-3 rounded-full ${color}`} />
                {index < activities.length - 1 && (
                  <div className="w-0.5 h-6 bg-border" />
                )}
              </div>
              <Card className="flex-1 gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">
                      {activity.activityName ?? activity.activityId}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {activity.activityType}
                    </span>
                    {activity.assignee && (
                      <span className="ml-2 text-xs text-info">
                        @{activity.assignee}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(activity.durationInMillis)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
