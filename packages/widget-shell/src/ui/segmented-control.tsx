import type { ReactNode } from "react"
import { cn } from "./cn.js"

export interface SegmentedControlOption<V extends string = string> {
  value: V
  label: ReactNode
}

/**
 * Compact multi-state toggle — a joined button row where the active segment
 * gets the soft-blue treatment. Modeled on the live/frequency/duration flow
 * toggle in the process-detail widget; `aria-pressed` carries the state.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<SegmentedControlOption<V>>
  value: V
  onChange: (next: V) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "border-border inline-flex overflow-hidden rounded-md border text-xs",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "focus-visible:ring-ring [&:not(:last-child)]:border-border px-2.5 py-1 font-medium outline-none transition-colors focus-visible:ring-2 [&:not(:last-child)]:border-r",
            value === option.value
              ? "bg-m-blue-soft text-m-blue"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
