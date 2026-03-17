import { useWidgetProps } from 'sunpeak';

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
  canceled: boolean;
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
  const output = useWidgetProps<TimelineOutput>();

  if (!output) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-300">Failed to load timeline</p>
        </div>
      </div>
    );
  }

  const { processInstance, activities } = output;

  return (
    <div className="p-6 space-y-4">
      {processInstance && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {processInstance.processDefinitionName ?? processInstance.processDefinitionKey}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span>{processInstance.state}</span>
            <span>Started {new Date(processInstance.startTime).toLocaleString()}</span>
            {processInstance.durationInMillis != null && (
              <span>Duration: {formatDuration(processInstance.durationInMillis)}</span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {activities.map((activity, index) => {
          const color = ACTIVITY_COLORS[activity.activityType] ?? 'bg-gray-400';
          return (
            <div key={activity.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full ${color}`} />
                {index < activities.length - 1 && (
                  <div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600" />
                )}
              </div>
              <div className="flex-1 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {activity.activityName ?? activity.activityId}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {activity.activityType}
                  </span>
                  {activity.assignee && (
                    <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                      @{activity.assignee}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDuration(activity.durationInMillis)}
                  </span>
                  {activity.canceled && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      canceled
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
