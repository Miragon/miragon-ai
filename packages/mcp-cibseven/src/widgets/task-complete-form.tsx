import { useMemo, useState } from "react"
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"

import type { TaskFormField, TaskFormSchema } from "@miragon-ai/client-cibseven"

interface TaskCompleteFormProps {
  taskId: string
  /** Pre-fetched form schema, if the server already provided one. */
  formSchema?: TaskFormSchema | null
  onCompleted?: () => void
  onCancel?: () => void
}

interface ManualEntry {
  id: string
  name: string
  value: string
  type: string
}

const TYPE_OPTIONS = ["String", "Boolean", "Long", "Double", "Json"]

export function TaskCompleteForm({
  taskId,
  formSchema,
  onCompleted,
  onCancel,
}: TaskCompleteFormProps) {
  const fetchedSchema = useToolQuery<TaskFormSchema>(
    ["camunda7", "task-form"],
    "camunda7_get_task_form",
    { taskId },
    { enabled: !formSchema },
  )

  const schema = formSchema ?? fetchedSchema.data ?? null

  if (!schema) {
    if (fetchedSchema.isError) {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            Could not load task form: {fetchedSchema.error.message}
          </AlertDescription>
        </Alert>
      )
    }
    return <p className="text-muted-foreground py-2 text-sm">Loading task form…</p>
  }

  return (
    <TaskCompleteFormBody
      taskId={taskId}
      schema={schema}
      onCompleted={onCompleted}
      onCancel={onCancel}
    />
  )
}

interface BodyProps {
  taskId: string
  schema: TaskFormSchema
  onCompleted?: () => void
  onCancel?: () => void
}

function TaskCompleteFormBody({ taskId, schema, onCompleted, onCancel }: BodyProps) {
  const completeMutation = useToolMutation("camunda7_complete_task")
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    initialFieldValues(schema),
  )
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const variables: Record<string, { value: unknown; type?: string }> = {}

    for (const field of schema.fields) {
      if (field.readonly) continue
      const raw = fieldValues[field.name]
      const required = isRequired(field)
      if (raw === undefined || raw === "") {
        if (required) {
          setSubmitError(`Pick a value for ${field.name} before completing the task`)
          return
        }
        continue
      }
      const coerced = coerceValue(raw, field.type)
      if (coerced === undefined) {
        setSubmitError(`Invalid value for ${field.name}: expected ${field.type ?? "value"}`)
        return
      }
      variables[field.name] = { value: coerced, type: field.type ?? "String" }
    }

    for (const entry of manualEntries) {
      const name = entry.name.trim()
      if (!name) continue
      if (entry.value === "") continue
      const coerced = coerceValue(entry.value, entry.type)
      if (coerced === undefined) {
        setSubmitError(`Invalid value for ${name}: expected ${entry.type}`)
        return
      }
      variables[name] = { value: coerced, type: entry.type }
    }

    completeMutation.mutate(
      { taskId, variables },
      {
        onSuccess: () => onCompleted?.(),
        onError: (error) => setSubmitError(error instanceof Error ? error.message : String(error)),
      },
    )
  }

  const editableFields = schema.fields.filter((f) => !f.readonly)
  const readonlyFields = schema.fields.filter((f) => f.readonly)

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      {schema.fields.length === 0 && manualEntries.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Für diesen Task ist kein Formular definiert.
        </p>
      )}
      {readonlyFields.length > 0 && (
        <div className="flex flex-col gap-2">
          {readonlyFields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              value={fieldValues[field.name] ?? ""}
              onChange={() => undefined}
            />
          ))}
        </div>
      )}
      {readonlyFields.length > 0 && editableFields.length > 0 && <hr className="border-border" />}
      {editableFields.map((field) => (
        <FieldRow
          key={field.name}
          field={field}
          value={fieldValues[field.name] ?? ""}
          onChange={(v) => setFieldValues((prev) => ({ ...prev, [field.name]: v }))}
        />
      ))}
      {manualEntries.map((entry) => (
        <ManualEntryRow
          key={entry.id}
          entry={entry}
          onChange={(updated) =>
            setManualEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)))
          }
          onRemove={() => setManualEntries((prev) => prev.filter((e) => e.id !== entry.id))}
        />
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setManualEntries((prev) => [
              ...prev,
              { id: crypto.randomUUID(), name: "", value: "", type: "String" },
            ])
          }
        >
          + Add variable
        </Button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Completing…" : "Complete task"}
          </Button>
        </div>
      </div>
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

function isRequired(field: TaskFormField): boolean {
  if (field.required === true) return true
  if (field.required === false) return false
  return false
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: TaskFormField
  value: string
  onChange: (v: string) => void
}) {
  const label = field.label ?? field.name
  const required = isRequired(field)
  const disabled = field.readonly === true

  const meta = useMemo(() => {
    const parts: string[] = []
    if (field.type) parts.push(field.type)
    if (required) parts.push("required")
    return parts.join(" · ")
  }, [field.type, required])

  if (field.suggestedValues && field.suggestedValues.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label className="text-muted-foreground text-sm font-medium">{label}</label>
          <span className="text-muted-foreground text-xs">{meta}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {field.suggestedValues.map((suggested) => {
            const stringified = stringifyValue(suggested)
            const selected = value === stringified
            return (
              <Button
                key={stringified}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onChange(stringified)}
              >
                {stringified}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  if (field.type === "Boolean") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label className={`text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}>
            {label}
          </label>
          <span className="text-muted-foreground text-xs">{meta}</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={value === "true" ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange("true")}
          >
            true
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value === "false" ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange("false")}
          >
            false
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label className={`text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}>
          {label}
        </label>
        <span className="text-muted-foreground text-xs">{meta}</span>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
        disabled={disabled}
      />
    </div>
  )
}

function ManualEntryRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: ManualEntry
  onChange: (updated: ManualEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        className="h-8 flex-1"
        placeholder="name"
        value={entry.name}
        onChange={(e) => onChange({ ...entry, name: e.target.value })}
      />
      <select
        className="border-input bg-background h-8 rounded-md border px-2 text-xs"
        value={entry.type}
        onChange={(e) => onChange({ ...entry, type: e.target.value })}
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <Input
        className="h-8 flex-1"
        placeholder="value"
        value={entry.value}
        onChange={(e) => onChange({ ...entry, value: e.target.value })}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
        ×
      </Button>
    </div>
  )
}

function initialFieldValues(schema: TaskFormSchema): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of schema.fields) {
    if (field.defaultValue !== undefined) {
      values[field.name] = stringifyValue(field.defaultValue)
    } else {
      values[field.name] = ""
    }
  }
  return values
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "bigint") {
    return String(value)
  }
  return JSON.stringify(value)
}

function coerceValue(raw: string, type?: string): unknown {
  if (raw === "") return ""
  if (!type || type === "String") return raw
  if (type === "Boolean") {
    if (raw === "true") return true
    if (raw === "false") return false
    return undefined
  }
  if (type === "Long" || type === "Integer") {
    if (!/^-?\d+$/.test(raw)) return undefined
    return Number(raw)
  }
  if (type === "Double") {
    const num = Number(raw)
    return Number.isFinite(num) ? num : undefined
  }
  if (type === "Json" || type === "Object") {
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  return raw
}
