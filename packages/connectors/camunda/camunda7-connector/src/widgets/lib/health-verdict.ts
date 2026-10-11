import { formatNumber } from "@miragon-ai/widget-shell/widgets"
import type { EngineHealthData } from "../../view-models.js"
import type { T } from "../../messages/use-t.js"

/**
 * The verdict line under the engine overview's title, in the view's
 * language: the server sends the verdict as data (status + counts, #322
 * U3), the widget words it. It states the numbers behind the verdict and
 * leaves the status word to the KPI header's badge. An engine with nothing
 * deployed says so instead of claiming "no open incidents" about an empty
 * engine.
 */
export function healthVerdictLine(t: T, data: Pick<EngineHealthData, "summary">): string {
  const { totalIncidents, affectedActivities, runningInstances, totalDefinitions } = data.summary
  if (totalIncidents === 0) {
    return totalDefinitions === 0
      ? t("engineHealth.verdict.nothingDeployed")
      : t("engineHealth.verdict.noIncidents", { running: formatNumber(runningInstances) })
  }
  const count = formatNumber(totalIncidents)
  // null: the incident scan was capped, so the activity count is unknown —
  // left out, never guessed.
  return affectedActivities === null
    ? t("engineHealth.verdict.incidents", { count })
    : t("engineHealth.verdict.incidentsAcross", {
        count,
        activities: formatNumber(affectedActivities),
      })
}
