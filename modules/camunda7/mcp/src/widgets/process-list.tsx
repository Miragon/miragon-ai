import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

interface ProcessDefinition {
  id: string
  key: string
  name: string | null
  version: number
  deploymentId: string | null
  suspended: boolean
  versionTag: string | null
  tenantId: string | null
}

export interface ProcessListData {
  definitions: ProcessDefinition[]
  totalCount: number
}

export function ProcessListWidget({ data }: { data: ProcessListData | null }) {
  if (!data) {
    return (
      <div className="p-6 bg-card text-card-foreground">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6 bg-card text-card-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Process Definitions</h2>
        <Badge variant="secondary">{data.totalCount} deployed</Badge>
      </div>

      <div className="grid gap-3">
        {data.definitions.map((def) => (
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
  )
}
