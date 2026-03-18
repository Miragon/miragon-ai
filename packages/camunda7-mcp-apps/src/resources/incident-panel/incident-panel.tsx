import { useState } from 'react';
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

interface DefinitionGroup {
  processDefinitionKey: string;
  incidentCount: number;
  latestIncident: string;
  incidents: IncidentData[];
}

interface IncidentPanelOutput {
  totalCount: number;
  definitions: DefinitionGroup[];
}

export const resource: ResourceConfig = {
  title: 'Open Incidents by Process Definition',
  description: 'Open incidents grouped by process definition with retry capabilities',
};

type RetryResult = 'idle' | 'loading' | 'resolved' | 'still-open' | 'error';

function IncidentCard({ incident }: { incident: IncidentData }) {
  const callServerTool = useCallServerTool();
  const [retryState, setRetryState] = useState<RetryResult>('idle');

  const canRetry = incident.incidentType === 'failedJob' && !!incident.configuration;

  const handleRetry = async () => {
    setRetryState('loading');
    try {
      const result = await callServerTool({
        name: 'retry-job-action',
        arguments: {
          jobId: incident.configuration!,
          retries: 1,
          incidentId: incident.id,
          processInstanceId: incident.processInstanceId,
        },
      });

      const resolved = (result?.structuredContent as { resolved?: boolean | null })?.resolved;
      setRetryState(resolved === true ? 'resolved' : 'still-open');
    } catch {
      setRetryState('error');
    }
  };

  if (retryState === 'resolved') {
    return (
      <Card className="gap-0 py-0 shadow-none border-success/30 bg-success/5">
        <CardContent className="flex items-center gap-2 p-4 text-success-foreground">
          <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-8.354a.5.5 0 00-.708-.708L7 9.586 5.354 7.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
          </svg>
          <span className="text-sm font-medium">Incident resolved</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none border-destructive/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
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
              <span>Instance: <code>{incident.processInstanceId.slice(0, 8)}...</code></span>
            </div>
            {retryState === 'still-open' && (
              <p className="mt-2 text-xs text-warning-foreground">
                Retry triggered but incident still open — the job may need more time or the root cause persists
              </p>
            )}
            {retryState === 'error' && (
              <p className="mt-2 text-xs text-destructive">Retry failed — please try again</p>
            )}
          </div>
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              disabled={retryState === 'loading'}
              onClick={handleRetry}
              className="shrink-0"
            >
              {retryState === 'loading' ? (
                <>
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Retrying…
                </>
              ) : retryState === 'still-open' ? (
                'Retry Again'
              ) : (
                'Retry Job'
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DefinitionSection({ group }: { group: DefinitionGroup }) {
  return (
    <details open>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          className="size-4 shrink-0 text-muted-foreground transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <span className="font-mono text-sm font-medium">{group.processDefinitionKey}</span>
        <Badge variant="destructive">{group.incidentCount}</Badge>
        <span className="text-xs text-muted-foreground">
          latest {new Date(group.latestIncident).toLocaleString()}
        </span>
      </summary>
      <div className="mt-2 ml-6 flex flex-col gap-3">
        {group.incidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>
    </details>
  );
}

export function IncidentPanelResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, IncidentPanelOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card text-card-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading incidents...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>Failed to load incidents</AlertDescription>
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

  return (
    <div className="flex flex-col gap-4 p-6 bg-card text-card-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Open Incidents</h2>
        <Badge variant="destructive">{output.totalCount} open</Badge>
      </div>

      {output.definitions.length === 0 ? (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No open incidents</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {output.definitions.map((group) => (
            <DefinitionSection key={group.processDefinitionKey} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
