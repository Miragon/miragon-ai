import type { ReactNode } from "react"
import { cn } from "@miragon/mcp-toolkit-ui"
import type { T } from "../messages/use-t.js"

/**
 * A process or an element the way the analytics tables show it (U13): its
 * name from the model first, and below it, quiet, the id (Geist Mono) plus
 * whatever else places it (`detail`: its type, its process). Without a known
 * name the id leads, still in mono, so a reader never takes it for a name.
 */
export function NamedId({
  name,
  id,
  detail,
  className,
}: {
  name: string | null
  id: string
  /** More quiet facts on the second line, after the id ("Service-Task", the process). */
  detail?: ReadonlyArray<ReactNode>
  className?: string
}) {
  const facts = (detail ?? []).filter((part) => part !== null && part !== undefined && part !== "")
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      {name ? (
        <span className="font-medium break-words">{name}</span>
      ) : (
        <span className="font-mono font-medium break-words">{id}</span>
      )}
      {(name || facts.length > 0) && (
        <span className="text-muted-foreground text-small break-words">
          {name && <span className="font-mono break-words">{id}</span>}
          {facts.map((part, index) => (
            <span key={index}>
              {(name || index > 0) && " · "}
              {part}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * The engine's activity types (`activity_type`, the engine's own names such
 * as `noneEndEvent` or `boundaryError`) folded into the BPMN element a reader
 * knows. A type it does not know stays as the engine wrote it.
 */
const EXACT_TYPES = new Set([
  "serviceTask",
  "userTask",
  "scriptTask",
  "sendTask",
  "receiveTask",
  "businessRuleTask",
  "manualTask",
  "task",
  "callActivity",
  "subProcess",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
])

/** The catalog key of an activity type's words, or null for a type without one. */
export function activityTypeKey(type: string): string | null {
  if (EXACT_TYPES.has(type)) return `aActivityType.${type}`
  if (/^boundary/.test(type)) return "aActivityType.boundaryEvent"
  if (/^intermediate/.test(type)) return "aActivityType.intermediateEvent"
  if (/^start|StartEvent$/.test(type)) return "aActivityType.startEvent"
  if (/^endEvent$|EndEvent$/.test(type)) return "aActivityType.endEvent"
  return null
}

/** An activity type in the view's words ("Service-Task", "Endereignis"), or as the engine wrote it. */
export function activityTypeLabel(t: T, type: string): string {
  const key = activityTypeKey(type)
  return key ? t(key) : type
}
