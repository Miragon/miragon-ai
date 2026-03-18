import { useToolData, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ActivityBreakdownItem {
  activityId: string;
  activityName: string;
  activityType: string;
  executionCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalTimeMs: number;
}

interface DefinitionBreakdownItem {
  processDefinitionKey: string;
  totalInstances: number;
  completed: number;
  running: number;
  failed: number;
  avgDurationMs: number | null;
}

interface AnalyticsOutput {
  totalCount: number;
  completedCount: number;
  runningCount: number;
  failedCount: number;
  incidentCount: number;
  failureRatePct: number;
  avgDurationMs: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  activityBreakdown: ActivityBreakdownItem[];
  definitionBreakdown: DefinitionBreakdownItem[];
}

export const resource: ResourceConfig = {
  title: 'Analytics Dashboard',
  description: 'Aggregated process metrics and KPIs from ClickHouse analytics',
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

  return (
    <div className="flex flex-col gap-6 p-6 bg-card text-card-foreground">
      <h2 className="text-xl font-semibold">Process Analytics</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80 text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{output.totalCount}</p>
          </CardContent>
        </Card>
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
            <p className="text-sm font-medium opacity-80">Failed</p>
            <p className="text-2xl font-bold">{output.failedCount}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-destructive/10 border-destructive/30 text-destructive">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Incidents</p>
            <p className="text-2xl font-bold">{output.incidentCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="gap-0 py-0 shadow-none bg-primary/10 border-primary/30 text-primary">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Avg Duration</p>
            <p className="text-2xl font-bold">{formatDuration(output.avgDurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-primary/10 border-primary/30 text-primary">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">Median</p>
            <p className="text-2xl font-bold">{formatDuration(output.medianDurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none bg-primary/10 border-primary/30 text-primary">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80">P95</p>
            <p className="text-2xl font-bold">{formatDuration(output.p95DurationMs)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-4">
            <p className="text-sm font-medium opacity-80 text-muted-foreground">Failure Rate</p>
            <p className="text-2xl font-bold">{output.failureRatePct}%</p>
          </CardContent>
        </Card>
      </div>

      {output.definitionBreakdown.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">By Process Definition</h3>
          <div className="flex flex-col gap-2">
            {output.definitionBreakdown.map((def) => (
              <Card key={def.processDefinitionKey} className="gap-0 py-0 shadow-none">
                <CardContent className="flex items-center justify-between p-3">
                  <span className="font-mono text-sm font-medium">{def.processDefinitionKey}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{def.totalInstances} total</span>
                    <span className="text-success-foreground">{def.completed} completed</span>
                    <span className="text-info-foreground">{def.running} running</span>
                    {def.failed > 0 && (
                      <Badge variant="destructive">{def.failed} failed</Badge>
                    )}
                    <span>avg {formatDuration(def.avgDurationMs)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {output.activityBreakdown.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-medium">Activity Bottlenecks</h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Executions</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">P95</TableHead>
                  <TableHead className="text-right">Total Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {output.activityBreakdown.map((act) => (
                  <TableRow key={act.activityId}>
                    <TableCell className="font-mono text-sm">
                      {act.activityName || act.activityId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{act.activityType}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{act.executionCount}</TableCell>
                    <TableCell className="text-right">{formatDuration(act.avgDurationMs)}</TableCell>
                    <TableCell className="text-right">{formatDuration(act.p95DurationMs)}</TableCell>
                    <TableCell className="text-right">{formatDuration(act.totalTimeMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
