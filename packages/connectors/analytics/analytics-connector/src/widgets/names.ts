import type { T } from "../messages/use-t.js"

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
