import type { ReactNode } from "react"

/**
 * Section title row — small uppercase-ish heading + optional muted hint on
 * the right. Matches the `.section h3` pattern in the Miragon mockup.
 */
export function SectionHeading({
  title,
  hint,
  trailing,
}: {
  title: ReactNode
  hint?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="text-ink-muted mb-3 flex items-center justify-between text-sm font-semibold">
      <span>{title}</span>
      {(hint || trailing) && (
        <span className="text-ink-subtle text-xs font-medium">{trailing ?? hint}</span>
      )}
    </div>
  )
}
