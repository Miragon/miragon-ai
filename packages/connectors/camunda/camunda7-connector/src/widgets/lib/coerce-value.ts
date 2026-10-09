/**
 * THE string→engine-value coercion for variable-writing widgets (the task
 * complete form and the instance variables editor). `undefined` means "invalid
 * for this type" — callers must surface an error instead of mutating, so a
 * typo never reaches the engine as a mistyped value (e.g. the raw string
 * "abc" written with type Integer).
 *
 * Serialized types stay strings: the engine takes a Json/Object/Xml value
 * only as its serialized STRING (a parsed object is a 400), so Json/Object
 * input is validated as JSON but sent as typed. Dates are validated against
 * the ISO 8601 forms the server's engine contract converts (`toEngineDate`).
 */

function coerceBoolean(raw: string): unknown {
  if (raw === "true") return true
  if (raw === "false") return false
  return undefined
}

function coerceWholeNumber(raw: string): unknown {
  if (!/^-?\d+$/.test(raw)) return undefined
  const num = Number(raw)
  // Beyond 2^53 `Number()` silently rounds to the nearest double — refuse
  // (field shows "invalid") instead of writing a corrupted value to the engine.
  return Number.isSafeInteger(num) ? num : undefined
}

function coerceDouble(raw: string): unknown {
  const num = Number(raw)
  return Number.isFinite(num) ? num : undefined
}

function coerceJson(raw: string): unknown {
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return undefined
  }
}

/** A date, or a date-time WITH offset — a local time would mean the engine's zone. */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?))?$/

function coerceDate(raw: string): unknown {
  const value = raw.trim()
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined
}

const COERCERS: Record<string, (raw: string) => unknown> = {
  Boolean: coerceBoolean,
  Long: coerceWholeNumber,
  Integer: coerceWholeNumber,
  Double: coerceDouble,
  Json: coerceJson,
  Object: coerceJson,
  Date: coerceDate,
}

export function coerceValue(raw: string, type?: string): unknown {
  if (raw === "") return ""
  if (!type) return raw
  const coerce = COERCERS[type]
  return coerce ? coerce(raw) : raw
}

/**
 * Whether the variables editor offers Edit for a variable: binary values
 * (File, Bytes) have no text form, and an Object is editable only in its JSON
 * serialization — a Java-serialized one is opaque bytes.
 */
export function isEditableVariable(variable: {
  type?: string
  valueInfo?: Record<string, unknown>
}): boolean {
  if (variable.type === "File" || variable.type === "Bytes") return false
  if (variable.type === "Object") {
    return variable.valueInfo?.serializationDataFormat === "application/json"
  }
  return true
}
