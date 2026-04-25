import { Card, CardContent, Badge, Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"

export type { CockpitDashboardData }

function StatCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant: "default" | "success" | "destructive" | "warning"
}) {
  const bg: Record<string, string> = {
    default: "bg-muted",
    success: "bg-success/10",
    destructive: "bg-destructive/10",
    warning: "bg-warning/10",
  }
  const text: Record<string, string> = {
    default: "text-foreground",
    success: "text-success-foreground",
    destructive: "text-destructive",
    warning: "text-warning-foreground",
  }
  return (
    <div className={`rounded-lg p-4 ${bg[variant]}`}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={`text-2xl font-bold ${text[variant]}`}>{value}</p>
    </div>
  )
}

export function CockpitDashboardWidget({ data }: { data: CockpitDashboardData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { summary, definitions } = data

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Cockpit Dashboard</h2>
        <Badge variant="secondary">{summary.totalDefinitions} definitions</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Definitions" value={summary.totalDefinitions} variant="default" />
        <StatCard
          label="Running Instances"
          value={summary.totalRunningInstances}
          variant="success"
        />
        <StatCard label="Failed Jobs" value={summary.totalFailedJobs} variant="destructive" />
        <StatCard label="Incidents" value={summary.totalIncidents} variant="warning" />
      </div>

      <details open>
        <summary className="text-muted-foreground mb-3 cursor-pointer text-sm font-medium">
          Process Definitions ({definitions.length})
        </summary>
        <div className="grid gap-2">
          {definitions.map((def) => {
            const totalIncidents = def.incidents.reduce((s, i) => s + i.incidentCount, 0)
            const hasIssues = def.failedJobs > 0 || totalIncidents > 0
            return (
              <Card
                key={def.id}
                className={`gap-0 py-0 shadow-none ${hasIssues ? "border-destructive/40" : ""}`}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{def.name ?? def.key}</h3>
                    <p className="text-muted-foreground font-mono text-sm">{def.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {def.instances} running
                    </Badge>
                    {def.failedJobs > 0 && (
                      <Badge variant="destructive">{def.failedJobs} failed</Badge>
                    )}
                    {totalIncidents > 0 && (
                      <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                        {totalIncidents} incidents
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-sm">v{def.version}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {definitions.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No process definitions deployed
            </p>
          )}
        </div>
      </details>
    </div>
  )
}
