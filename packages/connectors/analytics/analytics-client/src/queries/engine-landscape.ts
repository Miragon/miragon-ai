import {
  engineMatcher,
  selector,
  type EngineFilterInput,
  type PrometheusClient,
  type PromSample,
} from "../prometheus.js"
import { METRIC_NAMES as M } from "../metric-names.js"

/** Per-engine row of the landscape. Absolute counts only — see the module note. */
export interface EngineLandscapeEngine {
  engineId: string
  /**
   * `false` when the engine contributed no series at all: the plugin is down,
   * the engine is unreachable, or it was never scraped. Only reachable when the
   * caller passes the expected engine ids — an engine that reports nothing is
   * otherwise indistinguishable from one that does not exist.
   */
  reporting: boolean
  // ── Absolute load ────────────────────────────────────────────────────────
  // Counts, not rates: they are additive across engines and stay meaningful
  // regardless of which processes an engine happens to run.
  runningInstances: number
  openIncidents: number
  failedJobs: number
  // ── Engine-owned backlog ─────────────────────────────────────────────────
  // These gauges carry ONLY `engine_id` (no process label), so the process mix
  // cancels out — the one metric family that IS comparable across engines.
  executableJobs: number
  suspendedJobs: number
  jobsDueFuture: number
  openExternalTasks: number
  // ── Inventory ────────────────────────────────────────────────────────────
  deployedDefinitionKeys: number
  /** Keys present on this engine only — the load no other engine shares. */
  exclusiveDefinitionKeys: number
}

/** One row of the process × engine inventory matrix. */
export interface EngineLandscapeProcess {
  processDefinitionKey: string
  /** Engines this key is deployed on (or reports live state for), ascending. */
  engineIds: string[]
  /** Present on ≥2 engines — the only case where an A/B engine compare holds. */
  shared: boolean
  /** Running instances per engine id; engines without running work are absent. */
  runningByEngine: Record<string, number>
  runningTotal: number
  openIncidentsTotal: number
  failedJobsTotal: number
}

export interface EngineLandscapeResult {
  /** Ascending by engine id — deliberately not a ranking (see the module note). */
  engines: EngineLandscapeEngine[]
  /** Shared keys first, then by running instances descending, then by key. */
  processes: EngineLandscapeProcess[]
  /** Keys present on ≥2 engines — the valid drill-down targets for engineCompare. */
  sharedProcessKeys: string[]
  totals: {
    engineCount: number
    reportingEngineCount: number
    processKeyCount: number
    sharedProcessKeyCount: number
    runningInstances: number
    openIncidents: number
    failedJobs: number
  }
}

/** A `(engine_id, process_definition_key)` cell of the matrix. */
interface Cell {
  engineId: string
  processDefinitionKey: string
  value: number
}

/**
 * Cross-engine landscape: what runs where, how much of it, and which engines
 * carry a backlog.
 *
 * Deliberately NOT an engine-vs-engine scoreboard. Rates (failure rate,
 * incident rate, duration) aggregated per engine measure that engine's PROCESS
 * MIX, not the engine: an engine hosting an inherently error-prone process
 * reads "unhealthy" while running perfectly. So this query reports the two
 * things that survive a different mix per engine:
 *
 *  1. Absolute counts (running instances, open incidents, failed jobs) — they
 *     say where work and trouble physically sit, which is what an operator
 *     acts on, and they stay additive across engines.
 *  2. The engine-owned backlog gauges (`jobs_executable`, `jobs_suspended`,
 *     `jobs_due_future`, `external_tasks_open`), whose contract labels are
 *     `engine_id` ONLY. With no process dimension there is no mix to confound
 *     them, so these genuinely do rank engines against each other.
 *
 * The inventory matrix then names the one place a KPI comparison IS sound: a
 * process definition key present on two or more engines (`sharedProcessKeys`)
 * — the drill-down {@link engineCompare} requires.
 *
 * Pass `engine` as the array of CONFIGURED engine ids to also surface engines
 * that report nothing (`reporting: false`); without it the landscape can only
 * show engines Prometheus has series for.
 */
export async function engineLandscape(
  ch: PrometheusClient,
  params: { engine?: EngineFilterInput } = {},
): Promise<EngineLandscapeResult> {
  const sel = selector(engineMatcher(params.engine))

  // Flat `sum by (…)` per metric — the joining happens in TS. Nesting the
  // by-clauses would also defeat the contract test's grouping-label scan.
  const [
    deployed,
    running,
    incidents,
    failedJobs,
    executable,
    suspended,
    dueFuture,
    externalTasks,
  ] = await Promise.all([
    ch.instant(`sum by (engine_id, process_definition_key)(${M.processDefinitionsDeployed}${sel})`),
    ch.instant(`sum by (engine_id, process_definition_key)(${M.processInstancesRunning}${sel})`),
    ch.instant(`sum by (engine_id, process_definition_key)(${M.incidentsOpen}${sel})`),
    ch.instant(`sum by (engine_id, process_definition_key)(${M.jobsFailed}${sel})`),
    ch.instant(`sum by (engine_id)(${M.jobsExecutable}${sel})`),
    ch.instant(`sum by (engine_id)(${M.jobsSuspended}${sel})`),
    ch.instant(`sum by (engine_id)(${M.jobsDueFuture}${sel})`),
    ch.instant(`sum by (engine_id)(${M.externalTasksOpen}${sel})`),
  ])

  const deployedCells = cells(deployed)
  const runningCells = cells(running)
  const incidentCells = cells(incidents)
  const failedCells = cells(failedJobs)
  // A key counts as present on an engine when it is deployed there OR still has
  // live state there — a key undeployed while instances keep running would
  // otherwise drop out of the matrix that is supposed to explain them.
  const presence = [...deployedCells, ...runningCells, ...incidentCells, ...failedCells]

  // Every engine id seen anywhere, plus the ones the caller declared — so a
  // silent engine gets a row instead of vanishing from the overview.
  const reporting = new Set(
    [deployed, running, incidents, failedJobs, executable, suspended, dueFuture, externalTasks]
      .flat()
      .map((s) => s.metric.engine_id)
      .filter((id): id is string => !!id),
  )
  const engineIds = [...new Set([...expectedEngineIds(params.engine), ...reporting])].sort()

  const keysOn = (engineId: string): string[] => [
    ...new Set(presence.filter((c) => c.engineId === engineId).map((c) => c.processDefinitionKey)),
  ]
  const enginesWithKey = (key: string): string[] =>
    [
      ...new Set(presence.filter((c) => c.processDefinitionKey === key).map((c) => c.engineId)),
    ].sort()

  const engines: EngineLandscapeEngine[] = engineIds.map((engineId) => {
    const keys = keysOn(engineId)
    return {
      engineId,
      reporting: reporting.has(engineId),
      runningInstances: sumBy(runningCells, (c) => c.engineId === engineId),
      openIncidents: sumBy(incidentCells, (c) => c.engineId === engineId),
      failedJobs: sumBy(failedCells, (c) => c.engineId === engineId),
      executableJobs: engineValue(executable, engineId),
      suspendedJobs: engineValue(suspended, engineId),
      jobsDueFuture: engineValue(dueFuture, engineId),
      openExternalTasks: engineValue(externalTasks, engineId),
      deployedDefinitionKeys: keys.length,
      exclusiveDefinitionKeys: keys.filter((k) => enginesWithKey(k).length === 1).length,
    }
  })

  const processes: EngineLandscapeProcess[] = [
    ...new Set(presence.map((c) => c.processDefinitionKey)),
  ]
    .map((processDefinitionKey) => {
      const on = enginesWithKey(processDefinitionKey)
      const runningByEngine: Record<string, number> = {}
      for (const engineId of on) {
        const value = sumBy(
          runningCells,
          (c) => c.engineId === engineId && c.processDefinitionKey === processDefinitionKey,
        )
        if (value !== 0) runningByEngine[engineId] = value
      }
      const forKey = (list: Cell[]) =>
        sumBy(list, (c) => c.processDefinitionKey === processDefinitionKey)
      return {
        processDefinitionKey,
        engineIds: on,
        shared: on.length > 1,
        runningByEngine,
        runningTotal: forKey(runningCells),
        openIncidentsTotal: forKey(incidentCells),
        failedJobsTotal: forKey(failedCells),
      }
    })
    // Shared keys lead: they are the only rows offering a valid comparison.
    .sort(
      (a, b) =>
        Number(b.shared) - Number(a.shared) ||
        b.runningTotal - a.runningTotal ||
        a.processDefinitionKey.localeCompare(b.processDefinitionKey),
    )

  const sharedProcessKeys = processes.filter((p) => p.shared).map((p) => p.processDefinitionKey)

  return {
    engines,
    processes,
    sharedProcessKeys,
    totals: {
      engineCount: engines.length,
      reportingEngineCount: engines.filter((e) => e.reporting).length,
      processKeyCount: processes.length,
      sharedProcessKeyCount: sharedProcessKeys.length,
      runningInstances: sumBy(runningCells, () => true),
      openIncidents: sumBy(incidentCells, () => true),
      failedJobs: sumBy(failedCells, () => true),
    },
  }
}

/** The engine ids the caller declared, so silent engines still get a row. */
function expectedEngineIds(engine: EngineFilterInput): string[] {
  if (engine === undefined || engine === null) return []
  const ids = Array.isArray(engine) ? engine : [engine]
  return ids.filter((id) => id.length > 0)
}

/**
 * `(engine_id, process_definition_key)` samples as flat cells, dropping any
 * sample missing either label. Values are rounded — every source gauge is an
 * integer count.
 *
 * The `sum by (engine_id, process_definition_key)` above already folds every
 * extra dimension away (`incidents_open` carries an `incident_type`), so
 * Prometheus returns exactly ONE sample per pair. The `sumBy` callers therefore
 * add across pairs — all keys of one engine, or all engines of one key — never
 * within a pair.
 */
function cells(samples: PromSample[]): Cell[] {
  const out: Cell[] = []
  for (const s of samples) {
    const engineId = s.metric.engine_id
    const processDefinitionKey = s.metric.process_definition_key
    if (!engineId || !processDefinitionKey) continue
    out.push({ engineId, processDefinitionKey, value: Math.round(s.value) })
  }
  return out
}

const sumBy = (list: Cell[], match: (c: Cell) => boolean): number =>
  list.reduce((sum, c) => (match(c) ? sum + c.value : sum), 0)

/** Value of the `sum by (engine_id)` sample for one engine, or 0 when absent. */
const engineValue = (samples: PromSample[], engineId: string): number =>
  Math.round(samples.find((s) => s.metric.engine_id === engineId)?.value ?? 0)
