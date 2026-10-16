import type {
  AnalyticsDashboardData,
  EngineLandscapeResult,
  FailureDashboardData,
} from "@miragon/pulse-analytics-client"
import type { NameLookup } from "./bpmn-name-lookup.js"
import type { Named } from "./bpmn-names.js"

/**
 * The names behind the ids a view lists (U13), added to its payload once,
 * here — the show tool, its `*_data` feed and the pipeline step of a view
 * all pass their figures through the same function, so the three paths show
 * the same names. Names are enrichment: a model that cannot be read leaves
 * its key out of `names` and the view shows the id, never fails.
 *
 * Each model is read on the engines the view's rows come from (a process
 * that runs only on the third engine is still named), and a view names its
 * keys by priority: the lookup reads at most so many models per view.
 */

/**
 * The dashboard: its scope, then the processes of the activity breakdown
 * (whose element names the activity table shows: a bottleneck in a
 * low-volume process must not lose its names to the long tail of the
 * breakdown), then the per-definition breakdown. Its models are read on the
 * engines in scope that report, in configuration order.
 */
export async function namedDashboard(
  data: AnalyticsDashboardData,
  namesFor: NameLookup,
): Promise<Named<AnalyticsDashboardData>> {
  const keys = [
    ...(data.processDefinitionKey ? [data.processDefinitionKey] : []),
    ...data.activityBreakdown.map((a) => a.processDefinitionKey),
    ...data.definitionBreakdown.map((d) => d.processDefinitionKey),
  ]
  const elementIds = new Map<string, string[]>(keys.map((key) => [key, []]))
  for (const a of data.activityBreakdown) elementIds.get(a.processDefinitionKey)?.push(a.activityId)
  return {
    ...data,
    names: await namesFor(keys, {
      elementIds: Object.fromEntries(elementIds),
      engines: reportingInOrder(data.engines, data.reportingEngines),
    }),
  }
}

/** The failure dashboard: the processes of its incident groups and its per-process table. */
export async function namedFailureDashboard(
  data: FailureDashboardData,
  namesFor: NameLookup,
): Promise<Named<FailureDashboardData>> {
  const keys = [
    ...(data.mostAffectedProcess ? [data.mostAffectedProcess] : []),
    ...data.errorPatterns.map((p) => p.processDefinitionKey),
    ...data.processBreakdown.map((p) => p.processDefinitionKey),
  ]
  return {
    ...data,
    names: await namesFor(keys, { elementIds: noElements(keys), engines: data.engines }),
  }
}

/** The landscape: the processes of its what-runs-where matrix, each read on the engines it runs on. */
export async function namedLandscape(
  data: EngineLandscapeResult,
  namesFor: NameLookup,
): Promise<Named<EngineLandscapeResult>> {
  const keys = data.processes.map((p) => p.processDefinitionKey)
  return {
    ...data,
    names: await namesFor(keys, {
      elementIds: noElements(keys),
      enginesByKey: Object.fromEntries(
        data.processes.map((p) => [p.processDefinitionKey, p.engineIds]),
      ),
    }),
  }
}

/** Process names only: no element of these models is on screen. */
function noElements(keys: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(keys.map((key) => [key, []]))
}

/**
 * The engines in scope (configuration order: the default engine first) that
 * report metrics: the rows come from them, a silent engine has none. All of
 * the scope when the payload does not say which report.
 */
function reportingInOrder(
  engines: readonly string[] | null,
  reporting: readonly string[] | undefined,
): readonly string[] | null {
  if (!engines || !reporting) return engines ?? reporting ?? null
  return engines.filter((id) => reporting.includes(id))
}
