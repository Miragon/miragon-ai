import { useToolData, useCallServerTool, type ResourceConfig } from 'sunpeak';

interface TaskData {
  id: string;
  name: string | null;
  assignee: string | null;
  created: string;
  due: string | null;
  priority: number;
  processDefinitionId: string;
  processInstanceId: string;
  taskDefinitionKey: string;
  description: string | null;
}

interface DashboardOutput {
  tasks: TaskData[];
  totalCount: number;
  filters: {
    assignee?: string;
    candidateGroup?: string;
    processDefinitionKey?: string;
  };
}

export const resource: ResourceConfig = {
  title: 'Task Dashboard',
  description: 'Interactive dashboard showing open user tasks with claim and complete actions',
};

function PriorityBadge({ priority }: { priority: number }) {
  const level = priority >= 75 ? 'high' : priority >= 50 ? 'medium' : 'normal';
  const colors = {
    high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    normal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[level]}`}>
      {level}
    </span>
  );
}

function TimeAgo({ date }: { date: string }) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let text: string;
  if (diffDays > 0) text = `${diffDays}d ago`;
  else if (diffHours > 0) text = `${diffHours}h ago`;
  else if (diffMins > 0) text = `${diffMins}m ago`;
  else text = 'just now';

  return <span className="text-sm text-gray-500 dark:text-gray-400" title={then.toLocaleString()}>{text}</span>;
}

export function TaskDashboardResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, DashboardOutput>();
  const callServerTool = useCallServerTool();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading tasks...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-300">Failed to load tasks</p>
        </div>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="text-yellow-800 dark:text-yellow-300">Request was cancelled</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const handleClaim = async (taskId: string) => {
    const userId = output.filters.assignee ?? 'demo';
    await callServerTool({ name: 'claim-task-action', arguments: { taskId, userId } });
  };

  const handleComplete = async (taskId: string) => {
    await callServerTool({ name: 'complete-task-action', arguments: { taskId } });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Open Tasks
        </h2>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {output.totalCount} total
        </span>
      </div>

      {output.filters.assignee && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Filtered by assignee: <strong>{output.filters.assignee}</strong>
        </p>
      )}

      {output.tasks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">No tasks found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Task</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Assignee</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Process</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {output.tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{task.name ?? 'Unnamed Task'}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{task.taskDefinitionKey}</div>
                  </td>
                  <td className="px-4 py-3">
                    {task.assignee ? (
                      <span className="text-sm text-gray-900 dark:text-gray-100">{task.assignee}</span>
                    ) : (
                      <span className="text-sm italic text-gray-400 dark:text-gray-500">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                      {task.processDefinitionId.split(':')[0]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <TimeAgo date={task.created} />
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    {!task.assignee && (
                      <button
                        onClick={() => handleClaim(task.id)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Claim
                      </button>
                    )}
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Complete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
