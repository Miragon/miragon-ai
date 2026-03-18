import { useToolData, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface HistoricProcessInstance {
  id: string;
  processDefinitionKey: string;
  startTime: string;
  endTime: string | null;
  durationInMillis: number | null;
  state: string;
}

interface AnalyticsOutput {
  completedCount: number;
  runningCount: number;
  incidentCount: number;
  avgDurationMs: number | null;
  completedInstances: HistoricProcessInstance[];
  runningInstances: HistoricProcessInstance[];
}

export const resource: ResourceConfig = {
  title: 'Analytics Dashboard',
  description: 'Aggregated process metrics and KPIs from history data',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

export function AnalyticsDashboardResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, AnalyticsOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card text-card-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>Failed to load analytics</AlertDescription>
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

  // Group completed by process definition key
  const byKey = new Map<string, HistoricProcessInstance[]>();
  for (const inst of output.completedInstances) {
    const existing = byKey.get(inst.processDefinitionKey) ?? [];
    existing.push(inst);
    byKey.set(inst.processDefinitionKey, existing);
  }

  return (
    <div className="flex flex-col gap-6 p-6 bg-card text-card-foreground">
      <h2 className="text-xl font-semibold">Process Analytics</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="gap-0 py-0 shadow-none bg-success/10 border-success/30 text-success-foreground">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Completed</p>
            <p className="text-2xl font-bold">{output.completedCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-info/10 border-info/30 text-info-foreground">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Running</p>
            <p className="text-2xl font-bold">{output.runningCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-destructive/10 border-destructive/30 text-destructive">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Incidents</p>
            <p className="text-2xl font-bold">{output.incidentCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-primary/10 border-primary/30 text-primary">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Avg Duration</p>
            <p className="text-2xl font-bold">{formatDuration(output.avgDurationMs)}</p>
          </CardContent>
        </Card>
      </div>

      {byKey.size > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">By Process Definition</h3>
          <div className="flex flex-col gap-2">
            {[...byKey.entries()].map(([key, instances]) => {
              const durations = instances
                .filter(i => i.durationInMillis != null)
                .map(i => i.durationInMillis!);
              const avg = durations.length > 0
                ? durations.reduce((a, b) => a + b, 0) / durations.length
                : null;

              return (
                <Card key={key} className="gap-0 py-0 shadow-none">
                  <CardContent className="flex items-center justify-between p-3">
                    <span className="font-mono text-sm font-medium">{key}</span>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{instances.length} completed</span>
                      <span>avg {formatDuration(avg)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
