import type { ReactNode } from "react"
import { cn, FOCUS_RING_INSET, TONE_SOFT } from "@miragon/mcp-toolkit-ui"

export interface SegmentedControlOption<V extends string = string> {
  value: V
  label: ReactNode
}

/**
 * Compact multi-state toggle — a track of segments where the active one is a
 * selection in the info tone (CI: blue contour + tint, black text: an inset
 * info ring on the tint). Modeled on the live/frequency/duration flow toggle
 * in the process-detail widget; `aria-pressed` carries the state.
 *
 * The segments sit 2 px inside the track's edge, each with the track's
 * radius minus that inset (concentric corners), so the contour follows the
 * corner and never touches the track's border. A square segment clipped by a
 * rounded track left light wedges between the two lines at the corners, and
 * a middle segment's contour doubled the border.
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
        "border-border text-dense inline-flex gap-0.5 rounded-md border p-0.5",
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
            // 32 px in all, like the buttons beside it: 1 px border + 2 px inset + 26 px.
            "inline-flex h-[26px] items-center rounded-[calc(var(--radius-md)-3px)] px-2.5 font-medium transition-colors",
            FOCUS_RING_INSET,
            value === option.value
              ? cn(TONE_SOFT.info, "ring-info ring-1 ring-inset")
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
