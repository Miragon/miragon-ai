import type { ReactNode } from "react"
import { cn } from "@miragon/mcp-toolkit-ui"
import { IdText } from "@miragon-ai/widget-shell/widgets"

/**
 * Names before ids, one instance label everywhere (#322 U13). An operator
 * knows an instance by its business key ("LEA-2026-00424") and an activity or
 * process by its name ("Vertrag prüfen") — the engine's ids are the second,
 * quiet line, in Geist Mono, never the headline.
 */

/**
 * An instance as every view names it: its business key, the UUID beside it
 * as a copyable chip; without a key the chip IS the label (its short id).
 * The words match `instanceName`, which the toasts and confirmations use.
 */
export function InstanceLabel({
  id,
  businessKey,
  className,
}: {
  id: string
  businessKey: string | null | undefined
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2", className)}>
      {businessKey && <span className="text-foreground font-semibold">{businessKey}</span>}
      <IdText value={id} className="text-muted-foreground" />
    </span>
  )
}

/**
 * The version segment of a `key:version:deployment` definition id ("3"), or
 * null for a bare generated id — the widget twin of the data layer's parse,
 * which the browser bundle does not import.
 */
export function definitionVersionOf(definitionId: string | null | undefined): number | null {
  const segment = definitionId?.split(":")[1]
  return segment && /^\d+$/.test(segment) ? Number(segment) : null
}

/**
 * A named thing with its id: the name first, the id as a quiet Geist Mono
 * line under it. Without a name the id is the name — once, in mono.
 */
export function NamedId({
  name,
  id,
  lead,
  className,
}: {
  name: string | null | undefined
  id: string
  /** Before the name on its line (a state dot). */
  lead?: ReactNode
  className?: string
}) {
  const shown = name && name !== id ? name : null
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="text-foreground text-dense flex min-w-0 items-center gap-2 font-semibold">
        {lead}
        <span className={cn("break-words", !shown && "font-mono")}>{shown ?? id}</span>
      </span>
      {shown && <span className="text-muted-foreground text-small font-mono break-all">{id}</span>}
    </span>
  )
}
