import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { DeploymentBrowserData } from "@miragon-ai/client-cibseven"

export type { DeploymentBrowserData }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function resourceIcon(name: string): string {
  if (name.endsWith(".bpmn") || name.endsWith(".bpmn20.xml")) return "\u25B6"
  if (name.endsWith(".dmn") || name.endsWith(".dmn11.xml")) return "\u25C6"
  if (name.endsWith(".cmmn") || name.endsWith(".cmmn11.xml")) return "\u25A0"
  if (name.endsWith(".form") || name.endsWith(".json")) return "\u25CB"
  return "\u25CF"
}

export function DeploymentBrowserWidget({ data }: { data: DeploymentBrowserData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Deployments</h2>
        <Badge variant="secondary">{data.totalCount} total</Badge>
      </div>

      <div className="grid gap-3">
        {data.deployments.map((dep) => (
          <Card key={dep.id} className="gap-0 py-0 shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{dep.name ?? dep.id}</h3>
                  <p className="text-muted-foreground text-sm">{formatDate(dep.deploymentTime)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{dep.resources.length} resources</Badge>
                  {dep.source && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {dep.source}
                    </Badge>
                  )}
                </div>
              </div>

              {dep.resources.length > 0 && (
                <details className="mt-3">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    Resources
                  </summary>
                  <div className="mt-2 space-y-1">
                    {dep.resources.map((res) => (
                      <div
                        key={res.id}
                        className="bg-muted flex items-center gap-2 rounded px-3 py-1.5"
                      >
                        <span className="text-muted-foreground text-xs" aria-hidden="true">
                          {resourceIcon(res.name)}
                        </span>
                        <span className="font-mono text-sm">{res.name}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
        {data.deployments.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-sm">No deployments found</p>
        )}
      </div>
    </div>
  )
}
