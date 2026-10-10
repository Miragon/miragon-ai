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
 * with — one key, so the cockpit's two panels dedupe to one call. The cockpit
 * is the ONLY place the panels fetch: its incidents view is the engine's
 * whole dashboard (`props: { engine }`), so the feed takes the engine alone.
 * A standalone render (show tool, pipeline step) never fetches at all —
 * `useViewData` disables the query whenever `initialData` is set — so a
 * filtered dashboard's scope lives only in its data echo, which the hand-offs
 * read; a fresh view of it re-runs the show tool (or `refresh-view`) with its
 * own args.
 */
export function incidentsFeed(engine: string | undefined) {
  return {
    key: ["camunda7:incidents", engine ?? null],
    args: { engine },
    ready: !!engine,
  }
}
