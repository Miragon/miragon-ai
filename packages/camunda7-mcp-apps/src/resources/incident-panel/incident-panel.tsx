import { useToolData, useCallServerTool, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      <div className="flex items-center justify-center p-12 bg-card">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading incidents...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card">
        <Alert variant="destructive">
          <AlertDescription>Failed to load incidents</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="p-6 bg-card">
        <Alert className="border-yellow-200 text-yellow-800 dark:border-yellow-800 dark:text-yellow-300">
          <AlertDescription>Request was cancelled</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!output) return null;

  return (
    <div className="p-6 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Incidents</h2>
        <Badge variant="destructive">{output.totalCount} open</Badge>
      </div>

      {output.incidents.length === 0 ? (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No incidents found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {output.incidents.map((incident) => (
            <Card key={incident.id} className="gap-0 py-0 shadow-none border-red-200 dark:border-red-800/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="destructive">{incident.incidentType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(incident.incidentTimestamp).toLocaleString()}
                      </span>
                    </div>
                    {incident.incidentMessage && (
                      <p className="text-sm text-muted-foreground break-words font-mono">
                        {incident.incidentMessage}
                      </p>
                    )}
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>Activity: <code>{incident.activityId}</code></span>
                      <span>Process: <code>{incident.processInstanceId.slice(0, 8)}...</code></span>
                    </div>
                  </div>
                  {incident.configuration && incident.incidentType === 'failedJob' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => callServerTool({ name: 'retry-job-action', arguments: { jobId: incident.configuration!, retries: 1 } })}
                      className="ml-4 shrink-0"
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
