/**
 * Bounds what a variable READ hands the model. Variable values are
 * user-controlled and unbounded — a serialized Json/Xml/Object variable can
 * be megabytes — and the variable read tools returned every one at full size,
 * so a single call could flood the context. String values over the cap come
 * back cut, with an explicit marker instead of a silently shortened value:
 * `truncated: true` and the full `valueLength`.
 *
 * Model-facing tools only: the widget feeds read the same variables uncut
 * (an in-place edit writes the shown value back, so it must be whole).
 */

/** The longest variable value (in characters) a variable read returns. */
export const MAX_VARIABLE_VALUE_CHARS = 2000

/** The one sentence each variable read tool's description carries. */
export const VARIABLE_TRUNCATION_NOTE = `String values over ${MAX_VARIABLE_VALUE_CHARS} chars are cut (truncated: true, valueLength = full size).`

export interface TruncationMarker {
  truncated: true
  /** The full length of the value that was cut. */
  valueLength: number
}

/** A variable with a string value over the cap cut and marked; anything else unchanged. */
export function truncateVariable<T extends { value?: unknown }>(
  variable: T,
): T | (T & TruncationMarker) {
  const { value } = variable
  if (typeof value !== "string" || value.length <= MAX_VARIABLE_VALUE_CHARS) return variable
  return {
    ...variable,
    value: value.slice(0, MAX_VARIABLE_VALUE_CHARS),
    truncated: true,
    valueLength: value.length,
  }
}

/** A name → variable map (runtime variable reads) with every value bounded. */
export function truncateVariableMap<T extends { value?: unknown }>(
  variables: Record<string, T>,
): Record<string, T | (T & TruncationMarker)> {
  return Object.fromEntries(
    Object.entries(variables).map(([name, variable]) => [name, truncateVariable(variable)]),
  )
}

/** A page of variable rows (historic variable instances) with every value bounded. */
export function truncateVariableRows(rows: unknown): unknown {
  if (!Array.isArray(rows)) return rows
  return rows.map((row: unknown) =>
    typeof row === "object" && row !== null ? truncateVariable(row as { value?: unknown }) : row,
  )
}
