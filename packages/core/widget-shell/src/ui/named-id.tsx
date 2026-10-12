import type { ReactNode } from "react"
import { cn } from "@miragon/mcp-toolkit-ui"

/**
 * A named thing with its id, the way every module shows a process or an
 * element (#322 U13): the name first (dense, 600), and under it, quiet, the
 * id in Geist Mono plus whatever else places it (`detail`: its type, its
 * process). Without a known name, or with a name that only repeats the id,
 * the id leads, once, still in mono, so a reader never takes it for a name.
 * An id breaks anywhere so a long one never widens its column; the words
 * around it break only between words.
 */
export function NamedId({
  name,
  id,
  lead,
  detail,
  className,
}: {
  name: string | null | undefined
  id: string
  /** Before the name on its line (a state dot). */
  lead?: ReactNode
  /** More quiet facts on the second line, after the id ("Service-Task", the process). */
  detail?: ReadonlyArray<ReactNode>
  className?: string
}) {
  const shown = name && name !== id ? name : null
  const facts = (detail ?? []).filter((part) => part !== null && part !== undefined && part !== "")
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="text-foreground text-dense flex min-w-0 items-center gap-2 font-semibold">
        {lead}
        <span className={cn("break-words", !shown && "font-mono")}>{shown ?? id}</span>
      </span>
      {(shown || facts.length > 0) && (
        <span className="text-muted-foreground text-small break-words">
          {shown && <span className="font-mono break-all">{id}</span>}
          {facts.map((part, index) => (
            <span key={index}>
              {(shown || index > 0) && " · "}
              {part}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
