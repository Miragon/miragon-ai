import { cn } from "@miragon/mcp-toolkit-ui"
import { IdText } from "@miragon/pulse-widget-shell/widgets"

/**
 * Names before ids, one instance label everywhere (#322 U13). An operator
 * knows an instance by its business key ("LEA-2026-00424") and an activity or
 * process by its name ("Vertrag prüfen") — the engine's ids are the second,
 * quiet line, in Geist Mono, never the headline. A named activity or process
 * is the kit's `NamedId` (widget-shell `/widgets`), the look every module
 * shares.
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
