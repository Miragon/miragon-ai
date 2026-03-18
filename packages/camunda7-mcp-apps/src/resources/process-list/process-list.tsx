import { useToolData, type ResourceConfig } from 'sunpeak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProcessDefinition {
  id: string;
  key: string;
  name: string | null;
  version: number;
  deploymentId: string | null;
  suspended: boolean;
  versionTag: string | null;
  tenantId: string | null;
}

interface ProcessListOutput {
  definitions: ProcessDefinition[];
  totalCount: number;
}

export const resource: ResourceConfig = {
  title: 'Process Definitions',
  description: 'Shows deployed process definitions with instance counts',
};

export function ProcessListResource() {
  const { output, isLoading, isError, isCancelled } = useToolData<unknown, ProcessListOutput>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-card text-card-foreground">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading process definitions...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>Failed to load process definitions</AlertDescription>
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
        <h2 className="text-xl font-semibold">Process Definitions</h2>
        <Badge variant="secondary">{output.totalCount} deployed</Badge>
      </div>

      <div className="grid gap-3">
        {output.definitions.map((def) => (
          <Card key={def.id} className="gap-0 py-0 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <h3 className="font-medium">{def.name ?? def.key}</h3>
                <p className="text-sm font-mono text-muted-foreground">{def.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">v{def.version}</span>
                {def.versionTag && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {def.versionTag}
                  </Badge>
                )}
                {def.suspended ? (
                  <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                    Suspended
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-success/10 text-success-foreground">
                    Active
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
