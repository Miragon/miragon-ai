import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import type { ToneVariant } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { severityTone } from "../cockpit-dashboard/lib.js"

/**
 * Live health of one engine, straight from its REST API (no Prometheus): the
 * `camunda7_cockpit_overview_data` feed under the SAME query key the engine's
 * own cockpit overview uses, so a drill-in lands on a warm cache. Shared by the
 * fleet tiles and the landing's engine picker — both read the same numbers
 * through the same severity ladder (incl. the neutral tone for an idle engine,
 * which must not read as green).
 */
export function useEngineHealth(engineId: string) {
  const query = useToolQuery<CockpitDashboardData>(
    ["camunda7:cockpit-overview", engineId],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
    { engine: engineId },
  )
  const summary = query.data?.summary
  const incidents = summary?.totalIncidents ?? 0
  const failed = summary?.totalFailedJobs ?? 0
  const tone: ToneVariant = severityTone(failed, incidents, summary?.totalRunningInstances ?? 0)
  return { query, summary, incidents, failed, tone }
}
