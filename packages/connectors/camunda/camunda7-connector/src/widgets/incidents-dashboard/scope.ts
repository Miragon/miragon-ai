import type { IncidentsDashboardData } from "../../view-models.js"

/**
 * The scope every count of the incidents dashboard covers, read from the
 * data's own echo (a standalone render gets no props): the show tool's key
 * and incident-type filters. The hand-offs pass them as ids
 * (`camunda7_list_incidents` and `camunda7_query_historic_incidents` take
 * both), so the model re-queries the set the counts describe — and a filtered
 * total is stated as the matching incidents, never as the engine's open ones.
 */
export function dashboardScope(filters: IncidentsDashboardData["filters"]): {
  processDefinitionKey?: string
  incidentType?: string
  filtered: boolean
} {
  const processDefinitionKey = filters.processDefinitionKey || undefined
  const incidentType = filters.incidentType || undefined
  return {
    processDefinitionKey,
    incidentType,
    filtered: processDefinitionKey !== undefined || incidentType !== undefined,
  }
}

/**
 * The key + args both incidents panels self-fetch `camunda7_incidents_data`
 * with — one key, so the cockpit's two panels dedupe to one call. The engine
 * comes from the prop (cockpit) or the data's echo; the filters from the echo
 * — a refetch of a filtered render must never widen it to the engine's whole
 * dashboard.
 */
export function incidentsFeed(
  initialData: IncidentsDashboardData | null,
  engine: string | undefined,
) {
  const feedEngine = engine ?? initialData?.engineId
  const scope = dashboardScope(initialData?.filters ?? {})
  const args: Record<string, unknown> = {}
  if (feedEngine) args.engine = feedEngine
  if (scope.processDefinitionKey) args.processDefinitionKey = scope.processDefinitionKey
  if (scope.incidentType) args.incidentType = scope.incidentType
  return {
    key: [
      "camunda7:incidents",
      feedEngine ?? null,
      scope.processDefinitionKey ?? null,
      scope.incidentType ?? null,
    ],
    args,
    ready: !!feedEngine,
  }
}
