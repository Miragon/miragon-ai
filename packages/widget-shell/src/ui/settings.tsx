import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react"
import { Card, CardContent } from "@miragon/mcp-toolkit-ui"
import { cn } from "./cn.js"

/**
 * Shared building blocks for settings sections. The settings page composes one
 * section widget per module (camunda7's profile panel, analytics' defaults, …)
 * — these primitives keep the sections visually identical without the modules
 * sharing any code beyond this kit.
 */

/** One titled settings card — the visual unit a module's settings section renders. */
export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-4">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {children}
      </CardContent>
    </Card>
  )
}

/**
 * A labelled form field with optional help text. Associates the label with its
 * single child control via `htmlFor`/`id`; checkbox groups (no single control)
 * set `group` and get a `role="group"` labelled by the text instead.
 */
export function SettingsField({
  label,
  help,
  group = false,
  children,
}: {
  label: string
  help?: string
  /** Checkbox-group fields: labelled via role="group" (no single control to point htmlFor at). */
  group?: boolean
  children: ReactElement<{ id?: string }>
}) {
  const id = useId()
  const labelId = `${id}-label`
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <span id={labelId} className="text-foreground text-sm font-medium">
          {label}
        </span>
      ) : (
        <label htmlFor={id} className="text-foreground text-sm font-medium">
          {label}
        </label>
      )}
      {group ? (
        <div role="group" aria-labelledby={labelId}>
          {children}
        </div>
      ) : (
        cloneElement(children, { id })
      )}
      {help && <span className="text-muted-foreground text-xs">{help}</span>}
    </div>
  )
}

/** Styled native `<input>` matching `NativeSelect` — for the rare free-form settings value. */
export function SettingsInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "border-border bg-background text-foreground focus-visible:ring-ring h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}
