import { useToolData, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VariableValue {
  value: unknown;
  type?: string;
  valueInfo?: Record<string, unknown>;
}

interface ActivityTree {
  id: string;
  activityId: string;
  activityName: string | null;
  activityType: string;
  childActivityInstances: ActivityTree[];
}

interface InstanceDetailOutput {
  instance: {
    id: string;
    definitionId: string;
    businessKey: string | null;
    suspended: boolean;
    ended: boolean;
  };
  activityTree: ActivityTree | null;
  variables: Record<string, VariableValue>;
  bpmnXml: string | null;
}

export const resource: ResourceConfig = {
  title: 'Instance Detail',
  description: 'Detailed view of a single process instance with activity tree and variables',
};

function VariableTable({ variables }: { variables: Record<string, VariableValue> }) {
  const entries = Object.entries(variables);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No variables</p>;
  }
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, variable]) => (
            <TableRow key={name}>
              <TableCell className="font-mono font-medium">{name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{variable.type ?? 'unknown'}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground font-mono max-w-xs truncate">
                {JSON.stringify(variable.value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ActivityTreeNode({ node, depth = 0 }: { node: ActivityTree; depth?: number }) {
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <div className="flex items-center gap-2 py-1">
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {node.activityType}
        </Badge>
        <span className="text-sm">
          {node.activityName ?? node.activityId}
        </span>
      </div>
      {node.childActivityInstances.map((child) => (
        <ActivityTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function InstanceDetailResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, InstanceDetailOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading instance details...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card">
        <Alert variant="destructive">
          <AlertDescription>Failed to load instance details</AlertDescription>
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

  const { instance, activityTree, variables } = output;

  return (
    <div className="p-6 space-y-6 bg-card">
      <div>
        <h2 className="text-xl font-semibold">Process Instance</h2>
        <p className="text-sm font-mono text-muted-foreground">{instance.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Definition</p>
            <p className="text-sm font-mono font-medium">
              {instance.definitionId.split(':')[0]}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Business Key</p>
            <p className="text-sm font-medium">
              {instance.businessKey ?? '-'}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-sm font-medium">
              {instance.ended ? (
                <Badge variant="secondary">Ended</Badge>
              ) : instance.suspended ? (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  Suspended
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Active
                </Badge>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Variables</p>
            <p className="text-sm font-medium">
              {Object.keys(variables).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {activityTree && (
        <div>
          <h3 className="mb-2 text-lg font-medium">Activity Tree</h3>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-4">
              <ActivityTreeNode node={activityTree} />
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-lg font-medium">Variables</h3>
        <VariableTable variables={variables} />
      </div>
    </div>
  );
}
