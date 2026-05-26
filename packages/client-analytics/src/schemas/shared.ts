import { z } from "zod"

/**
 * Optional `engineId` filter spread into every analytics tool's input schema.
 *
 *   - Omitted → aggregates across all engines (cross-engine view, the default).
 *   - One id → restricts to one engine.
 *   - Array  → restricts to that subset (e.g. for prod-only or A-vs-B compare).
 */
export const engineFilterShape = {
  engineId: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Optional engine id (or list of ids) to scope the query. When omitted, aggregates across all engines. Use `camunda7_list_engines` to discover ids.",
    ),
}
