import { z } from "zod"
import { PERIODS } from "../prometheus.js"

/** Canonical `period` input field, derived from PERIOD_RANGE. */
export const periodField = z.enum(PERIODS).default("7d").describe("Analysis time period")

/**
 * ISO-datetime input field. Validates parseability at the tool boundary so an
 * LLM-supplied value like "last week" fails with a readable message instead of
 * reaching PromQL as `@ NaN`.
 */
export const isoDatetimeString = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "Not a parseable ISO datetime (expected e.g. 2026-07-01T12:00:00Z)",
})

/**
 * Optional `engine` filter spread into every analytics tool's input schema.
 * Same parameter name as the camunda7 operations tools' per-call override,
 * but a Prometheus label filter — no saved default, and with subset support:
 *
 *   - Omitted → the server's configured engines, aggregated (the fleet view).
 *   - One id → restricts to one engine.
 *   - Array  → restricts to that subset (e.g. for prod-only or A-vs-B compare).
 *
 * The analytics module resolves it against the configured engine ids (an id
 * outside them is refused) before any query runs.
 *
 * The description stays one line: the semantics are stated once in the
 * module's server instructions (`analytics-connector/src/instructions.ts`).
 */
export const engineFilterShape = {
  engine: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Engine id(s) to scope to; omitted = all configured (see server instructions)"),
}
