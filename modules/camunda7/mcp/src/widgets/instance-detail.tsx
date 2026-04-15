import {
  Card,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  AlertDescription,
} from "@miragon/mcp-toolkit-ui"

interface VariableValue {
  value: unknown
  type?: string
  valueInfo?: Record<string, unknown>
}

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

interface ActivityTree {
  id: string
  activityId: string
  activityName: string | null
  activityType: string
  childActivityInstances: ActivityTree[]
}

export interface InstanceDetailData {
  instance: {
    id: string
    definitionId: string
    businessKey: string | null
    suspended: boolean
    ended: boolean
  }
  activityTree: ActivityTree | null
  variables: Record<string, VariableValue>
  incidents?: IncidentData[]
  bpmnXml: string | null
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <svg
          className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
        </svg>
        <h3 className="text-lg font-medium">{title}</h3>
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function formatValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "—"
  if (type === "Json" || type === "Object" || typeof value === "object") {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

function ActivityNode({ node, depth = 0 }: { node: ActivityTree; depth?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 16}px` }}>
        <span className="text-muted-foreground font-mono text-xs">{node.activityType}</span>
        <span className="text-sm font-medium">{node.activityName ?? node.activityId}</span>
      </div>
      {node.childActivityInstances.map((child) => (
        <ActivityNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function InstanceDetailWidget({ data }: { data: InstanceDetailData | null }) {
  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { instance, activityTree, variables, incidents } = data
  const variableEntries = Object.entries(variables)

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-xl font-semibold">Process Instance Detail</h2>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>
            ID: <code className="font-mono">{instance.id}</code>
          </span>
          {instance.businessKey && (
            <span>
              Business Key: <code className="font-mono">{instance.businessKey}</code>
            </span>
          )}
          <Badge variant={instance.ended ? "secondary" : "default"}>
            {instance.ended ? "Ended" : "Running"}
          </Badge>
          {instance.suspended && <Badge variant="secondary">Suspended</Badge>}
        </div>
        <div className="text-muted-foreground mt-1 font-mono text-xs">
          Definition: {instance.definitionId}
        </div>
      </div>

      {incidents && incidents.length > 0 && (
        <Section title="Incidents" count={incidents.length} defaultOpen>
          <div className="flex flex-col gap-2">
            {incidents.map((inc) => (
              <Card key={inc.id} className="border-destructive/30 gap-0 py-0 shadow-none">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="destructive">{inc.incidentType}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {new Date(inc.incidentTimestamp).toLocaleString()}
                    </span>
                  </div>
                  {inc.incidentMessage && (
                    <p className="text-muted-foreground break-words font-mono text-sm">
                      {inc.incidentMessage}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {activityTree && (
        <Section title="Activity Tree" defaultOpen>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-3">
              <ActivityNode node={activityTree} />
            </CardContent>
          </Card>
        </Section>
      )}

      <Section title="Variables" count={variableEntries.length} defaultOpen>
        {variableEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">No variables</p>
        ) : (
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
                {variableEntries.map(([name, variable]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-sm">{name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {variable.type ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap break-words font-mono text-xs">
                      {formatValue(variable.value, variable.type)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  )
}
