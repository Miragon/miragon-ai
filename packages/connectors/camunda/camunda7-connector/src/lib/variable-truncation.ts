/**
 * Bounds what a variable READ hands the model. Variable values are
 * user-controlled and unbounded — a serialized Json/Xml/Object variable can
 * be megabytes — and the variable read tools returned every one at full size,
 * so a single call could flood the context. String values over the cap come
 * back cut, with an explicit marker instead of a silently shortened value:
 * `truncated: true` and the full `valueLength`.
 *
 * Model-facing tools only: the widget feeds read the same variables uncut
 * (an in-place edit writes the shown value back, so it must be whole). A cut
 * value is a lossy read for the model too, so the runtime reads take a
 * `variableName` that returns that ONE variable whole — the read a write-back
 * starts from — and the variable writes say never to send a cut value back.
 */

/** The longest variable value (in characters) a variable read returns. */
export const MAX_VARIABLE_VALUE_CHARS = 2000

/** The one sentence each variable read tool's description carries. */
export const VARIABLE_TRUNCATION_NOTE = `String values over ${MAX_VARIABLE_VALUE_CHARS} chars are cut (truncated: true, valueLength = full size).`

/**
 * The one sentence each variable WRITE that a model may feed from a read
 * carries: a cut value written back overwrites the stored value with its
 * prefix, silently losing the rest.
 */
export const CUT_VALUE_WRITE_RULE =
  "Never write back a value read with truncated: true — it is incomplete; read it whole first (variableName)."

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

/**
 * What a model-facing runtime variable read returns: every value bounded — or,
 * when the caller names ONE variable, that variable whole and unmarked (the
 * read a write-back needs). A name the read does not hold fails instead of
 * returning an empty map that would look like "no such data".
 */
export function variableRead<T extends { value?: unknown }>(
  variables: Record<string, T>,
  variableName?: string,
): Record<string, T | (T & TruncationMarker)> {
  if (variableName === undefined) return truncateVariableMap(variables)
  if (!Object.hasOwn(variables, variableName)) {
    throw new Error(`No variable named "${variableName}" — omit variableName to list them all.`)
  }
  return { [variableName]: variables[variableName] }
}
