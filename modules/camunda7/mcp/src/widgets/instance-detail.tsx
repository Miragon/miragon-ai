import { useState } from "react"
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
  Button,
  Input,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type {
  InstanceDetailData,
  ActivityTree,
  VariableValue,
} from "@automation-mcp/client-camunda7"

export type { InstanceDetailData }

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
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value)
  }
  return JSON.stringify(value)
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

function VariableRow({
  name,
  variable,
  instanceId,
  onSaved,
}: {
  name: string
  variable: VariableValue
  instanceId: string
  onSaved: (name: string, value: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const setVarMutation = useToolMutation("camunda7_set_process_instance_variable")

  function startEdit() {
    const v = variable.value
    setEditValue(typeof v === "object" ? JSON.stringify(v) : formatValue(v, variable.type))
    setEditing(true)
  }

  function save() {
    let parsed: unknown = editValue
    // Try to preserve the original type
    if (variable.type === "Integer" || variable.type === "Long") {
      const num = Number(editValue)
      if (!isNaN(num)) parsed = num
    } else if (variable.type === "Boolean") {
      parsed = editValue === "true"
    } else if (variable.type === "Json" || variable.type === "Object") {
      try {
        parsed = JSON.parse(editValue)
      } catch {
        /* keep as string */
      }
    } else if (variable.type === "Double") {
      const num = Number(editValue)
      if (!isNaN(num)) parsed = num
    }

    setVarMutation.mutate(
      {
        processInstanceId: instanceId,
        variableName: name,
        value: parsed,
        type: variable.type,
      },
      {
        onSuccess: () => {
          onSaved(name, parsed)
          setEditing(false)
        },
      },
    )
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{name}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{variable.type ?? "—"}</TableCell>
      <TableCell className="max-w-md whitespace-pre-wrap break-words font-mono text-xs">
        {editing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <Input
              className="h-7 font-mono text-xs"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
            <Button variant="outline" size="sm" type="submit" disabled={setVarMutation.isPending}>
              Save
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)}>
              X
            </Button>
          </form>
        ) : (
          formatValue(variable.value, variable.type)
        )}
      </TableCell>
      <TableCell className="w-16">
        {!editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function InstanceDetailWidget({ data }: { data: InstanceDetailData | null }) {
  const [localVars, setLocalVars] = useState<Map<string, unknown>>(new Map())
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

  const { instance, activityTree, variables, incidents } = data

  function getVariable(name: string, original: VariableValue): VariableValue {
    if (localVars.has(name)) {
      return { ...original, value: localVars.get(name) }
    }
    return original
  }

  function handleVarSaved(name: string, value: unknown) {
    setLocalVars((prev) => new Map(prev).set(name, value))
  }

  function handleResolve(incidentId: string) {
    resolveMutation.mutate(
      { incidentId },
      { onSuccess: () => setResolvedIds((prev) => new Set(prev).add(incidentId)) },
    )
  }

  const variableEntries = Object.entries(variables)
  const activeIncidents = (incidents ?? []).filter((i) => !resolvedIds.has(i.id))

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
        <Section title="Incidents" count={activeIncidents.length} defaultOpen>
          <div className="flex flex-col gap-2">
            {incidents.map((inc) => {
              const resolved = resolvedIds.has(inc.id)
              return (
                <Card
                  key={inc.id}
                  className={`border-destructive/30 gap-0 py-0 shadow-none ${resolved ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={resolved ? "secondary" : "destructive"}>
                          {resolved ? "Resolved" : inc.incidentType}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {new Date(inc.incidentTimestamp).toLocaleString()}
                        </span>
                      </div>
                      {!resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolveMutation.isPending}
                          onClick={() => handleResolve(inc.id)}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                    {inc.incidentMessage && (
                      <p className="text-muted-foreground break-words font-mono text-sm">
                        {inc.incidentMessage}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
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
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variableEntries.map(([name, variable]) => (
                  <VariableRow
                    key={name}
                    name={name}
                    variable={getVariable(name, variable)}
                    instanceId={instance.id}
                    onSaved={handleVarSaved}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  )
}
