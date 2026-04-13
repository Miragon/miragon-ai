import { Card, CardContent, Badge, Alert, AlertDescription } from "@automation-mcp/ui"

interface IncidentData {
  id: string
  processDefinitionId: string
  processInstanceId: string
  incidentType: string
  activityId: string
  incidentMessage: string | null
  incidentTimestamp: string
  configuration: string | null
}

interface DefinitionGroup {
  processDefinitionKey: string
  incidentCount: number
  latestIncident: string
  incidents: IncidentData[]
}

export interface IncidentPanelData {
  totalCount: number
  definitions: DefinitionGroup[]
}

function IncidentCard({ incident }: { incident: IncidentData }) {
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
              <span>
                Activity: <code>{incident.activityId}</code>
              </span>
              <span>
                Instance: <code>{incident.processInstanceId.slice(0, 8)}...</code>
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
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
  )
}

export function IncidentPanelWidget({ data }: { data: IncidentPanelData | null }) {
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
        <h2 className="text-xl font-semibold">Open Incidents</h2>
        <Badge variant="destructive">{data.totalCount} open</Badge>
      </div>

      {data.definitions.length === 0 ? (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No open incidents</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {data.definitions.map((group) => (
            <DefinitionSection key={group.processDefinitionKey} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
