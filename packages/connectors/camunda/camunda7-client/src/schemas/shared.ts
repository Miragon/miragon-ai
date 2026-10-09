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
 * Sort direction of every list query. The engine sorts only by a sortBy +
 * sortOrder PAIR; the tools pair them (`engineSorting`), so a sortBy alone
 * sorts ascending.
 */
export const sortOrderParam = z
  .enum(["asc", "desc"])
  .optional()
  .describe("Default asc; ignored without sortBy")

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
