import { Input } from "@miragon/mcp-toolkit-ui"

export interface FilterChip {
  id: string
  label: string
  count?: number | string
  active?: boolean
}

/**
 * Search input + chip row used to filter a list/table of widget items.
 * Matches the `.filterbar` block in the Miragon mockup.
 */
export function FilterBar({
  search,
  searchPlaceholder = "Filter…",
  onSearchChange,
  chips,
  onChipToggle,
}: {
  search: string
  searchPlaceholder?: string
  onSearchChange: (next: string) => void
  chips: FilterChip[]
  onChipToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-m-blue/30 focus-visible:border-m-blue h-9 min-w-[220px] flex-1 rounded-md text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            type="button"
            key={chip.id}
            onClick={() => onChipToggle(chip.id)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              chip.active
                ? "bg-m-blue-soft border-m-blue-light text-m-blue font-semibold"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {chip.label}
            {chip.count !== undefined && chip.count !== "" && (
              <span className="tabular-nums opacity-60">{chip.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
