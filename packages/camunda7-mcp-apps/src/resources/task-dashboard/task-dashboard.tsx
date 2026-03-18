import { useToolData, useCallServerTool, type ResourceConfig } from 'sunpeak';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <Badge variant="secondary" className={colors[level]}>
      {level}
    </Badge>
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

  return <span className="text-sm text-muted-foreground" title={then.toLocaleString()}>{text}</span>;
}

export function TaskDashboardResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, DashboardOutput>();
  const callServerTool = useCallServerTool();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading tasks...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card">
        <Alert variant="destructive">
          <AlertDescription>Failed to load tasks</AlertDescription>
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

  const handleClaim = async (taskId: string) => {
    const userId = output.filters.assignee ?? 'demo';
    await callServerTool({ name: 'claim-task-action', arguments: { taskId, userId } });
  };

  const handleComplete = async (taskId: string) => {
    await callServerTool({ name: 'complete-task-action', arguments: { taskId } });
  };

  return (
    <div className="p-6 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Open Tasks</h2>
        <Badge variant="secondary">{output.totalCount} total</Badge>
      </div>

      {output.filters.assignee && (
        <p className="text-sm text-muted-foreground">
          Filtered by assignee: <strong>{output.filters.assignee}</strong>
        </p>
      )}

      {output.tasks.length === 0 ? (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No tasks found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {output.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="font-medium">{task.name ?? 'Unnamed Task'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{task.taskDefinitionKey}</div>
                  </TableCell>
                  <TableCell>
                    {task.assignee ? (
                      <span className="text-sm">{task.assignee}</span>
                    ) : (
                      <span className="text-sm italic text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-muted-foreground">
                      {task.processDefinitionId.split(':')[0]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell>
                    <TimeAgo date={task.created} />
                  </TableCell>
                  <TableCell className="space-x-2">
                    {!task.assignee && (
                      <Button size="sm" onClick={() => handleClaim(task.id)}>
                        Claim
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleComplete(task.id)}>
                      Complete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
