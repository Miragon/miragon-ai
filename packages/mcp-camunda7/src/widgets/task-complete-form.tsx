import { useMemo, useState } from "react"
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { NativeSelect } from "@miragon-ai/widget-shell/widgets"

import { useT } from "../messages/use-t.js"
import type { TaskFormField, TaskFormSchema } from "../view-models.js"
import { coerceValue } from "./lib/coerce-value.js"

interface TaskCompleteFormProps {
  taskId: string
  /** Engine the task lives on — threaded into the form fetch and the complete
   * call so both target the viewed engine, not the session default. */
  engine?: string
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
  engine,
  formSchema,
  onCompleted,
  onCancel,
}: TaskCompleteFormProps) {
  const t = useT()
  const fetchedSchema = useToolQuery<TaskFormSchema>(
    ["camunda7", "task-form", engine ?? null, taskId],
    "camunda7_get_task_form",
    { taskId, engine },
    { enabled: !formSchema },
  )

  const schema = formSchema ?? fetchedSchema.data ?? null

  if (!schema) {
    if (fetchedSchema.isError) {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {t("taskForm.loadError", { message: fetchedSchema.error.message })}
          </AlertDescription>
        </Alert>
      )
    }
    return <p className="text-muted-foreground py-2 text-sm">{t("taskForm.loading")}</p>
  }

  return (
    <TaskCompleteFormBody
      taskId={taskId}
      engine={engine}
      schema={schema}
      onCompleted={onCompleted}
      onCancel={onCancel}
    />
  )
}

interface BodyProps {
  taskId: string
  engine?: string
  schema: TaskFormSchema
  onCompleted?: () => void
  onCancel?: () => void
}

function TaskCompleteFormBody({ taskId, engine, schema, onCompleted, onCancel }: BodyProps) {
  const t = useT()
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
          setSubmitError(t("taskForm.errorRequired", { name: field.name }))
          return
        }
        continue
      }
      const coerced = coerceValue(raw, field.type)
      if (coerced === undefined) {
        setSubmitError(
          t("taskForm.errorInvalid", { name: field.name, type: field.type ?? "value" }),
        )
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
        setSubmitError(t("taskForm.errorInvalid", { name, type: entry.type }))
        return
      }
      variables[name] = { value: coerced, type: entry.type }
    }

    completeMutation.mutate(
      { taskId, variables, engine },
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
        <p className="text-muted-foreground text-sm">{t("taskForm.empty")}</p>
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
          {t("taskForm.addVariable")}
        </Button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t("taskForm.cancel")}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={completeMutation.isPending}>
            {completeMutation.isPending ? t("taskForm.completing") : t("taskForm.complete")}
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
  const t = useT()
  const label = field.label ?? field.name
  const required = isRequired(field)
  const disabled = field.readonly === true

  const meta = useMemo(() => {
    const parts: string[] = []
    if (field.type) parts.push(field.type)
    if (required) parts.push(t("taskForm.required"))
    return parts.join(" · ")
  }, [field.type, required, t])

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
        <label
          htmlFor={`field-${field.name}`}
          className={`text-sm font-medium ${disabled ? "text-muted-foreground" : ""}`}
        >
          {label}
        </label>
        <span className="text-muted-foreground text-xs">{meta}</span>
      </div>
      <Input
        id={`field-${field.name}`}
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
  const t = useT()
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={t("taskForm.variableName")}
        className="h-8 flex-1"
        placeholder={t("taskForm.namePlaceholder")}
        value={entry.name}
        onChange={(e) => onChange({ ...entry, name: e.target.value })}
      />
      <NativeSelect
        aria-label={t("taskForm.variableType")}
        className="h-8 text-xs"
        value={entry.type}
        onChange={(e) => onChange({ ...entry, type: e.target.value })}
      >
        {TYPE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
      <Input
        aria-label={t("taskForm.variableValue")}
        className="h-8 flex-1"
        placeholder={t("taskForm.valuePlaceholder")}
        value={entry.value}
        onChange={(e) => onChange({ ...entry, value: e.target.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("taskForm.removeVariable")}
        onClick={onRemove}
      >
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
