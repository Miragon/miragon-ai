/**
 * The environment grouping over the flat engine list — single-sourced so the
 * `camunda7_engine` list output, the cockpit's two-stage landing chooser, the
 * sidebar switcher and the settings panel all derive the SAME map. The
 * environment is a selection/grouping level only: engine ids stay flat and
 * globally unique (the join key against the metrics' `engine_id` label and the
 * per-call `engine` override), so resolution and analytics are untouched by it.
 */

/** Environment engines fall into when their entry carries none. */
export const DEFAULT_ENVIRONMENT_ID = "default"

/** The environment an engine belongs to (absent field = the default environment). */
export function environmentOf(engine: { environment?: string }): string {
  return engine.environment ?? DEFAULT_ENVIRONMENT_ID
}

export interface EnvironmentGroup<E> {
  id: string
  engines: E[]
}

/**
 * Groups engines by environment in first-appearance order — config order is
 * author-controlled, so the pickers list environments the way the deployment
 * wrote them. A list without any `environment` fields yields exactly one
 * group (the default environment): consumers use `groups.length > 1` as the
 * "render the environment stage at all" switch.
 */
export function groupEnginesByEnvironment<E extends { environment?: string }>(
  engines: E[],
): EnvironmentGroup<E>[] {
  const groups = new Map<string, E[]>()
  for (const engine of engines) {
    const id = environmentOf(engine)
    const group = groups.get(id)
    if (group) group.push(engine)
    else groups.set(id, [engine])
  }
  return [...groups.entries()].map(([id, grouped]) => ({ id, engines: grouped }))
}

/**
 * The env-grouped engine id list as prose — `"prod-eu: a, b; prod-us: c"`,
 * flat `"a, b, c"` when only one environment exists. The model-facing fleet
 * strings (model context, Ask-AI prompts) must describe the fleet exactly the
 * way the widget groups it on screen, so every one of them derives from this
 * single formatter over the SAME groups the widget renders.
 */
export function formatEnginesByEnvironment(
  groups: Array<EnvironmentGroup<{ id: string }>>,
): string {
  return groups.length > 1
    ? groups.map((g) => `${g.id}: ${g.engines.map((e) => e.id).join(", ")}`).join("; ")
    : (groups[0]?.engines ?? []).map((e) => e.id).join(", ")
}
