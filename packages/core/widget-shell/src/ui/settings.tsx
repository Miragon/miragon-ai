import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react"
import { Card, CardContent, cn, TONE_INK } from "@miragon/mcp-toolkit-ui"
import { CircleAlert } from "lucide-react"
import { Icon } from "./icon.js"
import { FIELD_CONTROL } from "./native-select.js"

/**
 * Shared building blocks for settings sections. The settings page composes one
 * section widget per module (camunda7's profile panel, analytics' defaults, …)
 * — these primitives keep the sections visually identical without the modules
 * sharing any code beyond this kit.
 */

/**
 * One titled settings card — the visual unit a module's settings section
 * renders. Its title is an `h3` under the section's own `h2` heading; a
 * section whose cards sit directly under the page title (`h1`) passes
 * `titleAs="h2"`, so the outline never skips a level.
 */
export function SettingsCard({
  title,
  titleAs: Title = "h3",
  children,
}: {
  title: string
  titleAs?: "h2" | "h3"
  children: ReactNode
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-4">
        <Title className="text-foreground text-section">{title}</Title>
        {children}
      </CardContent>
    </Card>
  )
}

/** The props a field hands its single control. */
interface FieldControlProps {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/**
 * A labelled form field with optional help text. Associates the label with its
 * single child control via `htmlFor`/`id`; checkbox groups (no single control)
 * set `group` and get a `role="group"` labelled by the text instead.
 *
 * `error` is the inline validation of the entry (CI §8/§9: say what is wrong
 * where it is, never correct it silently): a line in the danger ink right
 * under the control with an icon, the control marked `aria-invalid` and
 * described by the line (and by the help text, which stays).
 */
export function SettingsField({
  label,
  help,
  error,
  group = false,
  children,
}: {
  label: string
  help?: string
  /** What is wrong with the entry, in words ("Enter a whole number of 1 or more."). */
  error?: string
  /** Checkbox-group fields: labelled via role="group" (no single control to point htmlFor at). */
  group?: boolean
  children: ReactElement<FieldControlProps>
}) {
  const id = useId()
  const labelId = `${id}-label`
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(" ")
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <span id={labelId} className="text-foreground text-dense font-medium">
          {label}
        </span>
      ) : (
        <label htmlFor={id} className="text-foreground text-dense font-medium">
          {label}
        </label>
      )}
      {group ? (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy || undefined}>
          {children}
        </div>
      ) : (
        cloneElement(children, {
          id,
          "aria-describedby": describedBy || undefined,
          "aria-invalid": error ? true : undefined,
        })
      )}
      {error && (
        <span id={errorId} className={cn("text-small flex items-center gap-1.5", TONE_INK.danger)}>
          <Icon icon={CircleAlert} dense />
          {error}
        </span>
      )}
      {help && (
        <span id={helpId} className="text-muted-foreground text-small">
          {help}
        </span>
      )}
    </div>
  )
}

/** Styled native `<input>` matching `NativeSelect` — for the rare free-form settings value. */
export function SettingsInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(FIELD_CONTROL, className)} />
}
