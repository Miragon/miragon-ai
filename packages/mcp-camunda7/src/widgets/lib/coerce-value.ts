/**
 * THE string→engine-value coercion for variable-writing widgets (the task
 * complete form and the instance variables editor). `undefined` means "invalid
 * for this type" — callers must surface an error instead of mutating, so a
 * typo never reaches the engine as a mistyped value (e.g. the raw string
 * "abc" written with type Integer).
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
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const COERCERS: Record<string, (raw: string) => unknown> = {
  Boolean: coerceBoolean,
  Long: coerceWholeNumber,
  Integer: coerceWholeNumber,
  Double: coerceDouble,
  Json: coerceJson,
  Object: coerceJson,
}

export function coerceValue(raw: string, type?: string): unknown {
  if (raw === "") return ""
  if (!type) return raw
  const coerce = COERCERS[type]
  return coerce ? coerce(raw) : raw
}
