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

/** `engine: "<id>", ` to open a literal call template's arguments. */
export function engineArg(engineId: string | null | undefined): string {
  return engineId ? `engine: "${engineId}", ` : ""
}

/** The closing instruction to pass the engine on EVERY camunda7_* call. */
export function engineCallRule(engineId: string | null | undefined): string {
  return engineId
    ? ` Pass engine: "${engineId}" on every camunda7_* call: without it a call routes to the saved default engine, which may be a different one.`
    : ""
}
