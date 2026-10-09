/**
 * Prompt fragments that pin an AI handoff (and a view's model context) to the
 * engine the user is LOOKING at. Cockpit navigation never writes the caller's
 * saved default engine, so an engine-less camunda7_* call the model copies
 * from a prompt routes to that saved default — possibly ANOTHER engine — and
 * its answer ("no incidents") would read as this engine's. With no known
 * engine (a standalone render that the default itself routed) both add
 * nothing: the default IS the engine the data came from. English on purpose —
 * these strings address the model, not the user.
 */

import { CAMUNDA7_ENGINELESS_TOOLS } from "../../tool-names.js"

/** `engine: "<id>", ` to open a literal call template's arguments. */
export function engineArg(engineId: string | null | undefined): string {
  return engineId ? `engine: "${engineId}", ` : ""
}

/** `a, b and c` — the engine-less tools as the rule names them. */
const ENGINELESS_TOOL_LIST = `${CAMUNDA7_ENGINELESS_TOOLS.slice(0, -1).join(", ")} and ${CAMUNDA7_ENGINELESS_TOOLS.at(-1)}`

/**
 * The closing instruction to pass the engine on every camunda7_* call that
 * takes one. The tools that route to no engine are named as the exception:
 * strict input refuses an `engine` a tool does not take, so an unscoped
 * "every call" turned a request like "show my settings" into a refused call
 * and a retry.
 */
export function engineCallRule(engineId: string | null | undefined): string {
  return engineId
    ? ` Pass engine: "${engineId}" on every camunda7_* call except ${ENGINELESS_TOOL_LIST}, which take no engine: without it a call routes to the saved default engine, which may be a different one.`
    : ""
}
