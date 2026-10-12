import type { ComponentProps } from "react"
import { cn, FOCUS_RING } from "@miragon/mcp-toolkit-ui"

/**
 * The form control look the kit's native inputs share (CI §8 "Eingabefelder"):
 * the `--input` edge (`--cd-kontur`, 3:1 against the card — the decorative
 * `--border` reaches 1.26:1), the danger edge on an entry marked
 * `aria-invalid` (with the field's error line, `SettingsField`), 14 px (the
 * dense-controls step), the md radius and the toolkit's opaque focus ring.
 */
export const FIELD_CONTROL = cn(
  "border-input bg-background text-foreground text-dense aria-invalid:border-danger h-9 rounded-md border px-2 disabled:cursor-not-allowed disabled:opacity-50",
  FOCUS_RING,
)

/**
 * Styled native `<select>` on the role tokens — the one canonical class
 * string for dropdowns in widgets (user-profile and the task form each
 * hand-rolled their own, with diverging border tokens). Native on purpose:
 * widget iframes keep the host's popover positioning out of the picture.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(FIELD_CONTROL, className)} />
}
