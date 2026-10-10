import { Input, useLocale } from "@miragon/mcp-toolkit-ui"
import { cn } from "./cn.js"
import { kitLabels } from "./kit-labels.js"
import { TONE_BORDER, TONE_SOFT } from "./tone-utils.js"

export interface FilterChip {
  id: string
  label: string
  count?: number | string
  active?: boolean
}

/**
 * Search input + chip row used to filter a list/table of widget items. An
 * active chip is a selection: the info tone's tint, edge and ink (CI:
 * selection = blue edge + tint), with `aria-pressed` carrying the state.
 */
export function FilterBar({
  search,
  searchPlaceholder,
  searchAriaLabel,
  onSearchChange,
  chips,
  onChipToggle,
  className,
}: {
  search: string
  /** Defaults to the active locale's "Filter…". */
  searchPlaceholder?: string
  /** Accessible name for the search input; defaults to the placeholder. */
  searchAriaLabel?: string
  onSearchChange: (next: string) => void
  chips: FilterChip[]
  onChipToggle: (id: string) => void
  className?: string
}) {
  const locale = useLocale()
  const placeholder = searchPlaceholder ?? kitLabels(locale).filter
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        aria-label={searchAriaLabel ?? placeholder}
        className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-focus focus-visible:border-focus h-9 min-w-[220px] flex-1 rounded-md text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.id}
            onClick={() => onChipToggle(chip.id)}
            aria-pressed={!!chip.active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              chip.active
                ? cn(TONE_SOFT.info, TONE_BORDER.info, "font-semibold")
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {chip.label}
            {chip.count !== undefined && chip.count !== "" && (
              <span className="font-normal tabular-nums">{chip.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
