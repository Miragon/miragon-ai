/**
 * Engine ids the host simulation configures (global-setup.ts) and the
 * scenarios address through a tool's `engine` argument (host-sim.spec.ts).
 * Kept dependency-free so the spec's workers never load the server graph.
 */
export const HEALTHY_ENGINE = "stub"
/** Answers every engine request with a 503 — turns any tool into a real `isError` result. */
export const BROKEN_ENGINE = "down"
