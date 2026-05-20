import { useState } from "react"
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type { ActivityTree, VariableValue } from "@miragon-ai/client-cibseven"

export function Section({
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

export function formatVariableValue(value: unknown, type?: string): string {
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

export function ActivityNode({ node, depth = 0 }: { node: ActivityTree; depth?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 16}px` }}>
        <span className="text-muted-foreground font-mono text-xs">{node.activityType}</span>
        <span className="text-sm font-medium">{node.activityName ?? node.activityId}</span>
      </div>
      {(node.childActivityInstances ?? []).map((child) => (
        <ActivityNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

function VariableRow({
  name,
  variable,
  instanceId,
  readOnly,
  onSaved,
}: {
  name: string
  variable: VariableValue
  instanceId: string
  readOnly: boolean
  onSaved: (name: string, value: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const setVarMutation = useToolMutation("camunda7_set_process_instance_variable")

  function startEdit() {
    const v = variable.value
    setEditValue(typeof v === "object" ? JSON.stringify(v) : formatVariableValue(v, variable.type))
    setEditing(true)
  }

  function save() {
    let parsed: unknown = editValue
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
          formatVariableValue(variable.value, variable.type)
        )}
      </TableCell>
      <TableCell className="w-16">
        {!editing && !readOnly && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function VariablesTable({
  variables,
  instanceId,
  readOnly = false,
}: {
  variables: Record<string, VariableValue>
  instanceId: string
  readOnly?: boolean
}) {
  const [localVars, setLocalVars] = useState<Map<string, unknown>>(new Map())
  const entries = Object.entries(variables)

  function getVariable(name: string, original: VariableValue): VariableValue {
    if (localVars.has(name)) {
      return { ...original, value: localVars.get(name) }
    }
    return original
  }

  function handleSaved(name: string, value: unknown) {
    setLocalVars((prev) => new Map(prev).set(name, value))
  }

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No variables</p>
  }

  return (
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
          {entries.map(([name, variable]) => (
            <VariableRow
              key={name}
              name={name}
              variable={getVariable(name, variable)}
              instanceId={instanceId}
              readOnly={readOnly}
              onSaved={handleSaved}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
