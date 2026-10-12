import type {
  AnalyticsDashboardData,
  EngineLandscapeResult,
  FailureDashboardData,
} from "@miragon-ai/analytics-client"
import type { NameLookup } from "./bpmn-name-lookup.js"
import type { Named } from "./bpmn-names.js"

/**
 * The names behind the ids a view lists (U13), added to its payload once,
 * here — the show tool, its `*_data` feed and the pipeline step of a view
 * all pass their figures through the same function, so the three paths show
 * the same names. Names are enrichment: a model that cannot be read leaves
 * its key out of `names` and the view shows the id, never fails.
 */

/** The dashboard: every process it lists, and the elements of the activity breakdown. */
export async function namedDashboard(
  data: AnalyticsDashboardData,
  namesFor: NameLookup,
): Promise<Named<AnalyticsDashboardData>> {
  const elementIds: Record<string, string[]> = {}
  const keys = [
    ...(data.processDefinitionKey ? [data.processDefinitionKey] : []),
    ...data.definitionBreakdown.map((d) => d.processDefinitionKey),
    ...data.activityBreakdown.map((a) => a.processDefinitionKey),
  ]
  for (const key of keys) elementIds[key] ??= []
  for (const a of data.activityBreakdown) elementIds[a.processDefinitionKey].push(a.activityId)
  return { ...data, names: await namesFor(keys, elementIds) }
}

/** The failure dashboard: the processes of its incident groups and its per-process table. */
export async function namedFailureDashboard(
  data: FailureDashboardData,
  namesFor: NameLookup,
): Promise<Named<FailureDashboardData>> {
  const keys = [
    ...data.errorPatterns.map((p) => p.processDefinitionKey),
    ...data.processBreakdown.map((p) => p.processDefinitionKey),
    ...(data.mostAffectedProcess ? [data.mostAffectedProcess] : []),
  ]
  return { ...data, names: await namesFor(keys, noElements(keys)) }
}

/** The landscape: the processes of its what-runs-where matrix. */
export async function namedLandscape(
  data: EngineLandscapeResult,
  namesFor: NameLookup,
): Promise<Named<EngineLandscapeResult>> {
  const keys = data.processes.map((p) => p.processDefinitionKey)
  return { ...data, names: await namesFor(keys, noElements(keys)) }
}

/** Process names only: no element of these models is on screen. */
function noElements(keys: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(keys.map((key) => [key, []]))
}
