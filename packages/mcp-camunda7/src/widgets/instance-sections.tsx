import { useEffect, useState } from "react"
import {
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

import type { ActivityTree, VariableValue } from "../view-models.js"
import { useT } from "../messages/use-t.js"
import { coerceValue } from "./lib/coerce-value.js"
import { refreshCockpitData } from "./refresh.js"

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
  engine,
  readOnly,
  onSaved,
}: {
  name: string
  variable: VariableValue
  instanceId: string
  engine?: string
  readOnly: boolean
  onSaved: (name: string, value: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const setVarMutation = useToolMutation("camunda7_set_process_instance_variable")
  const t = useT()

  function startEdit() {
    const v = variable.value
    setEditValue(typeof v === "object" ? JSON.stringify(v) : formatVariableValue(v, variable.type))
    setEditError(null)
    // Clear a prior failed save so the stale server error doesn't reappear when
    // the operator reopens the row.
    setVarMutation.reset()
    setEditing(true)
  }

  function save() {
    // coerceValue passes "" through for untyped/String variables only; an
    // empty field is not a valid Integer/Boolean/Json either — both cases show
    // the inline error instead of writing a mistyped value to the engine.
    const typed = variable.type !== undefined && variable.type !== "String"
    const parsed = typed && editValue === "" ? undefined : coerceValue(editValue, variable.type)
    if (parsed === undefined) {
      setEditError(t("instanceSections.invalidValue", { type: variable.type ?? "String" }))
      return
    }
    setEditError(null)

    setVarMutation.mutate(
      {
        processInstanceId: instanceId,
        variableName: name,
        value: parsed,
        type: variable.type,
        engine,
      },
      {
        onSuccess: () => {
          onSaved(name, parsed)
          setEditing(false)
          refreshCockpitData()
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
            className="flex flex-col gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="flex items-center gap-1">
              <Input
                className="h-7 font-mono text-xs"
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value)
                  setEditError(null)
                }}
                aria-invalid={editError !== null}
                autoFocus
              />
              <Button variant="outline" size="sm" type="submit" disabled={setVarMutation.isPending}>
                {t("instanceSections.save")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={t("instanceSections.cancelEditing")}
                onClick={() => setEditing(false)}
              >
                ×
              </Button>
            </div>
            {editError && (
              <p role="alert" className="text-destructive font-sans text-xs">
                {editError}
              </p>
            )}
            {/* Server-side rejection of a validly-parsed write — without this the
                Save button just re-enables and the row stays silently in edit. */}
            {!editError && setVarMutation.error && (
              <p role="alert" className="text-destructive font-sans text-xs">
                {t("instanceSections.saveError", { message: setVarMutation.error.message })}
              </p>
            )}
          </form>
        ) : (
          formatVariableValue(variable.value, variable.type)
        )}
      </TableCell>
      <TableCell className="w-16">
        {!editing && !readOnly && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            {t("instanceSections.edit")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

export function VariablesTable({
  variables,
  instanceId,
  engine,
  readOnly = false,
}: {
  variables: Record<string, VariableValue>
  instanceId: string
  engine?: string
  readOnly?: boolean
}) {
  const [localVars, setLocalVars] = useState<Map<string, unknown>>(new Map())
  const t = useT()
  // The optimistic shadows only bridge the gap until the feed refetches —
  // fresh server data (new `variables` identity) must win again.
  useEffect(() => setLocalVars(new Map()), [variables])
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
    return <p className="text-muted-foreground text-sm">{t("instanceSections.noVariables")}</p>
  }

  return (
    <div className="rounded-lg border">
      <Table aria-label={t("instanceSections.variablesTableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("instanceSections.columnName")}</TableHead>
            <TableHead scope="col">{t("instanceSections.columnType")}</TableHead>
            <TableHead scope="col">{t("instanceSections.columnValue")}</TableHead>
            <TableHead scope="col" className="w-16">
              <span className="sr-only">{t("instanceSections.columnActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, variable]) => (
            <VariableRow
              key={name}
              name={name}
              variable={getVariable(name, variable)}
              instanceId={instanceId}
              engine={engine}
              readOnly={readOnly}
              onSaved={handleSaved}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
