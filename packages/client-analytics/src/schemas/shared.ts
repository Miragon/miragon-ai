import { z } from "zod"

/**
 * Optional `engine` filter spread into every analytics tool's input schema.
 * Same parameter name as the camunda7 operations tools' per-call override,
 * but stateless (no sticky session) and with subset support:
 *
 *   - Omitted → aggregates across all engines (cross-engine view, the default).
 *   - One id → restricts to one engine.
 *   - Array  → restricts to that subset (e.g. for prod-only or A-vs-B compare).
 */
export const engineFilterShape = {
  engine: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Optional engine id (or list of ids) to scope the query. When omitted, aggregates across all engines. Use `camunda7_list_engines` to discover ids.",
    ),
}
