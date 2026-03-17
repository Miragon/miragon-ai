import { useToolData, useCallServerTool, type ResourceConfig } from 'sunpeak';

interface IncidentData {
  id: string;
  processDefinitionId: string;
  processInstanceId: string;
  incidentType: string;
  activityId: string;
  incidentMessage: string | null;
  incidentTimestamp: string;
  jobDefinitionId: string | null;
  configuration: string | null;
  failedActivityId: string | null;
  annotation: string | null;
}

interface IncidentPanelOutput {
  incidents: IncidentData[];
  totalCount: number;
}

export const resource: ResourceConfig = {
  title: 'Incident Panel',
  description: 'Error monitoring panel with retry capabilities for failed jobs',
};

export function IncidentPanelResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, IncidentPanelOutput>();
  const callServerTool = useCallServerTool();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading incidents...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-300">Failed to load incidents</p>
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Incidents</h2>
        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {output.totalCount} open
        </span>
      </div>

      {output.incidents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">No incidents found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {output.incidents.map((incident) => (
            <div
              key={incident.id}
              className="rounded-lg border border-red-200 bg-white p-4 dark:border-red-800/50 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {incident.incidentType}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(incident.incidentTimestamp).toLocaleString()}
                    </span>
                  </div>
                  {incident.incidentMessage && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 break-words font-mono">
                      {incident.incidentMessage}
                    </p>
                  )}
                  <div className="mt-2 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Activity: <code>{incident.activityId}</code></span>
                    <span>Process: <code>{incident.processInstanceId.slice(0, 8)}...</code></span>
                  </div>
                </div>
                {incident.configuration && incident.incidentType === 'failedJob' && (
                  <button
                    onClick={() => callServerTool({ name: 'retry-job-action', arguments: { jobId: incident.configuration!, retries: 1 } })}
                    className="ml-4 shrink-0 rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
