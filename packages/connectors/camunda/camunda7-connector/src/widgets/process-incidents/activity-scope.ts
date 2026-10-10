import type { ProcessIncidentsData } from "../../view-models.js"

/** "X of Y activities affected", both sides over the rendered diagram. */
export interface DiagramActivityFraction {
  /** Activities of the diagram with open incidents. */
  affected: number
  /** Activities in the diagram. */
  total: number
  /** Activities with open incidents that only older versions have — outside X and Y. */
  olderVersionsOnly: number
}

/**
 * The definition view's activity fraction (#335 N60). `activities` spans
 * every version of the key while the diagram is the latest one, so the
 * numerator is the diagram's own affected activities — never the key-wide
 * list over the diagram's total (which can read "3 of 2"). Null without a
 * diagram: then only the key-wide `activities.length` is known.
 */
export function diagramActivityFraction(
  data: Pick<
    ProcessIncidentsData,
    "activities" | "totalActivityCount" | "affectedDiagramActivityCount"
  >,
): DiagramActivityFraction | null {
  if (data.totalActivityCount === null || data.affectedDiagramActivityCount === null) return null
  return {
    affected: data.affectedDiagramActivityCount,
    total: data.totalActivityCount,
    olderVersionsOnly: data.activities.length - data.affectedDiagramActivityCount,
  }
}
