import { z } from "zod"

/**
 * Envelope returned by every list/query tool. A raw array capped at
 * `maxResults` is ambiguous — the model cannot tell "20 returned" from
 * "exactly 20 exist" — so each page carries the engine's real total and an
 * explicit continuation offset.
 *
 * Advertised as the tool's MCP `outputSchema` via the registrar. `items`
 * stays `z.unknown()` on purpose: the per-domain DTOs are large generated
 * types and the envelope, not the row shape, is the contract here.
 */
export const paginatedListOutput = z.object({
  items: z.array(z.unknown()).describe("One page of results"),
  totalCount: z.number().int().describe("Total number of results matching the filters"),
  hasMore: z.boolean().describe("Whether more results exist beyond this page"),
  nextOffset: z
    .number()
    .int()
    .optional()
    .describe("Present when hasMore is true: pass as firstResult to fetch the next page"),
})

export type PaginatedList<T> = {
  items: T[]
  totalCount: number
  hasMore: boolean
  nextOffset?: number
}

/**
 * Builds the envelope from one page of results and the matching `/count`
 * response (fired in parallel). The generated SDK is typed for the default
 * `fields` response style, but the configured client returns plain data —
 * hence the defensive casts, mirroring the cockpit data builders.
 *
 * When the count call returns no usable number, the total falls back to
 * `firstResult + items.length` so `hasMore` degrades to `false` instead of
 * inventing pages that may not exist.
 */
export function toPaginatedList<T>(
  itemsRaw: unknown,
  countRaw: unknown,
  firstResult: number | undefined,
): PaginatedList<T> {
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []) as T[]
  const offset = firstResult ?? 0
  const count = (countRaw as { count?: number } | null | undefined)?.count
  const totalCount = typeof count === "number" ? count : offset + items.length
  const hasMore = totalCount > offset + items.length
  return {
    items,
    totalCount,
    hasMore,
    ...(hasMore ? { nextOffset: offset + items.length } : {}),
  }
}
