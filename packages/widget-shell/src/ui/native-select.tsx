import type { ComponentProps } from "react"
import { cn } from "./cn.js"

/**
 * Styled native `<select>` on the shadcn tokens — the one canonical class
 * string for dropdowns in widgets (user-profile and the task form each
 * hand-rolled their own, with diverging border tokens). Native on purpose:
 * widget iframes keep the host's popover positioning out of the picture.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "border-border bg-background text-foreground focus-visible:ring-ring h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  )
}
