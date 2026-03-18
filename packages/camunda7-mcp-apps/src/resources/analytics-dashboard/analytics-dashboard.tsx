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

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card className={`gap-0 py-0 shadow-none ${color}`}>
      <CardContent className="p-4">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

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
      <div className="flex items-center justify-center p-12 bg-card">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card">
        <Alert variant="destructive">
          <AlertDescription>Failed to load analytics</AlertDescription>
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

  // Group completed by process definition key
  const byKey = new Map<string, HistoricProcessInstance[]>();
  for (const inst of output.completedInstances) {
    const existing = byKey.get(inst.processDefinitionKey) ?? [];
    existing.push(inst);
    byKey.set(inst.processDefinitionKey, existing);
  }

  return (
    <div className="p-6 space-y-6 bg-card">
      <h2 className="text-xl font-semibold">Process Analytics</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Completed"
          value={output.completedCount}
          color="border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
        />
        <StatCard
          label="Running"
          value={output.runningCount}
          color="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
        />
        <StatCard
          label="Incidents"
          value={output.incidentCount}
          color="border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(output.avgDurationMs)}
          color="border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
        />
      </div>

      {byKey.size > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">By Process Definition</h3>
          <div className="space-y-2">
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
