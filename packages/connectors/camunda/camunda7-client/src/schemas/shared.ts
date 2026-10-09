import { z } from "zod"
import { ENGINE_DATE_INPUT_FORMS, isEngineDateInput } from "../engine-contract/dates.js"

/**
 * Variable metadata in the engine's `valueInfo` shape. Object values need
 * `objectTypeName` (the Java type) and travel serialized in
 * `serializationDataFormat` (default application/json).
 */
export const variableValueInfo = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Object: { objectTypeName, serializationDataFormat }")

export const variableSchema = z
  .record(
    z.string(),
    z.object({
      value: z.unknown().describe("Variable value"),
      type: z
        .string()
        .optional()
        .describe("Variable type (String, Long, Boolean, Date: ISO 8601, Json, Object, …)"),
      valueInfo: variableValueInfo,
    }),
  )
  .describe("Process variables map")

/**
 * Shared pagination offset for every list/query input schema. Pairs with
 * `maxResults`: a list tool returns the page `[firstResult, firstResult +
 * maxResults)` plus a total count, so callers page through by passing the
 * `nextOffset` from the previous response.
 */
export const firstResultParam = z
  .number()
  .int()
  .min(0)
  .optional()
  .default(0)
  .describe("Zero-based index of the first result to return (pagination offset)")

/**
 * The largest page any list/query tool returns. One page is what a model
 * reads in one turn: an uncapped `maxResults` let a single call pull an
 * engine's whole history into the context. More rows are one `nextOffset`
 * call away — the envelope says so.
 */
export const MAX_PAGE_SIZE = 100

/**
 * The shared `maxResults` field of every list/query input schema: capped at
 * {@link MAX_PAGE_SIZE}, with a per-tool default page size.
 */
export function maxResultsParam(defaultPageSize = 20) {
  return z
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(defaultPageSize)
    .describe("Page size")
}

/**
 * Sort direction of every list query. The engine sorts only by a sortBy +
 * sortOrder PAIR; the tools pair them (`engineSorting`), so a sortBy alone
 * sorts ascending.
 */
export const sortOrderParam = z
  .enum(["asc", "desc"])
  .optional()
  .describe("Default asc; ignored without sortBy")

/**
 * An optional `…Like` filter. The tools send it through `engineLike`, which
 * wraps a value without `%` into a substring match — the engine itself would
 * match it EXACTLY — so the description promises a substring.
 */
export function likeParam(description: string) {
  return z.string().optional().describe(`${description} (substring; % wildcards allowed)`)
}

/**
 * An optional boolean filter. The engine IGNORES a `false` (no filter, not a
 * negation), so the tools never forward one: a flag with a complement is
 * sent as the complement (`complementaryFlags`), any other is dropped
 * (`trueOnly`). The description says which, e.g.
 * `"true = only active, false = only suspended"`.
 */
export function flagParam(description: string) {
  return z.boolean().optional().describe(description)
}

/**
 * An optional ISO 8601 date filter, converted to the engine's own format by
 * `toEngineDate` in the tool handler. Validated by a refinement, not a
 * pattern: the accepted forms are named in the description instead of a
 * regex the model would have to read.
 */
export function engineDateParam(description: string) {
  return z
    .string()
    .refine(isEngineDateInput, { message: `Expected ${ENGINE_DATE_INPUT_FORMS}` })
    .optional()
    .describe(`${description} (ISO 8601: date, or date-time with offset)`)
}
