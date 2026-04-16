import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Button,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

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

function IncidentCard({
  incident,
  resolved,
  resolving,
  onResolve,
}: {
  incident: IncidentData
  resolved: boolean
  resolving: boolean
  onResolve: () => void
}) {
  return (
    <Card
      className={`border-destructive/30 gap-0 py-0 shadow-none ${resolved ? "opacity-50" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant={resolved ? "secondary" : "destructive"}>
                {resolved ? "Resolved" : incident.incidentType}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {new Date(incident.incidentTimestamp).toLocaleString()}
              </span>
            </div>
            {incident.incidentMessage && (
              <p className="text-muted-foreground break-words font-mono text-sm">
                {incident.incidentMessage}
              </p>
            )}
            <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
              <span>
                Activity: <code>{incident.activityId}</code>
              </span>
              <span>
                Instance: <code>{incident.processInstanceId.slice(0, 8)}...</code>
              </span>
            </div>
          </div>
          {!resolved && (
            <Button
              variant="outline"
              size="sm"
              disabled={resolving}
              onClick={onResolve}
              className="shrink-0"
            >
              Resolve
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DefinitionSection({
  group,
  resolvedIds,
  resolving,
  onResolve,
}: {
  group: DefinitionGroup
  resolvedIds: Set<string>
  resolving: boolean
  onResolve: (id: string) => void
}) {
  const unresolvedCount = group.incidents.filter((i) => !resolvedIds.has(i.id)).length
  return (
    <details open>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <span className="font-mono text-sm font-medium">{group.processDefinitionKey}</span>
        <Badge variant={unresolvedCount === 0 ? "secondary" : "destructive"}>
          {unresolvedCount}
        </Badge>
        <span className="text-muted-foreground text-xs">
          latest {new Date(group.latestIncident).toLocaleString()}
        </span>
      </summary>
      <div className="ml-6 mt-2 flex flex-col gap-3">
        {group.incidents.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            resolved={resolvedIds.has(incident.id)}
            resolving={resolving}
            onResolve={() => onResolve(incident.id)}
          />
        ))}
      </div>
    </details>
  )
}

export function IncidentPanelWidget({ data }: { data: IncidentPanelData | null }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const resolveMutation = useToolMutation("camunda7_resolve_incident")

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  function handleResolve(incidentId: string) {
    resolveMutation.mutate(
      { incidentId },
      { onSuccess: () => setResolvedIds((prev) => new Set(prev).add(incidentId)) },
    )
  }

  const unresolvedTotal = data.totalCount - resolvedIds.size

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Open Incidents</h2>
        <Badge variant={unresolvedTotal === 0 ? "secondary" : "destructive"}>
          {unresolvedTotal} open
        </Badge>
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
            <DefinitionSection
              key={group.processDefinitionKey}
              group={group}
              resolvedIds={resolvedIds}
              resolving={resolveMutation.isPending}
              onResolve={handleResolve}
            />
          ))}
        </div>
      )}
    </div>
  )
}
