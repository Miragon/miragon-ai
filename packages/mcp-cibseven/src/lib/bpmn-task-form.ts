/**
 * Best-effort BPMN parser for user task form definitions.
 *
 * `extractEmbeddedFormFields` reads `<camunda:formData>` from a user task and
 * returns structured form fields. Fields with `<camunda:property id="readonly"
 * value="true">` are marked as readonly (displayed but not submitted).
 */
import type { TaskFormField } from "../view-models.js"

interface ConditionLiteral {
  value: unknown
  type: "String" | "Boolean" | "Long" | "Double"
}

interface InferredCondition {
  variable: string
  literal: ConditionLiteral
}

const CAMUNDA_TYPE_MAP: Record<string, string> = {
  string: "String",
  boolean: "Boolean",
  long: "Long",
  integer: "Long",
  double: "Double",
  date: "String",
  enum: "String",
}

/**
 * Extract `<camunda:formField>` elements from the user task identified by
 * `taskDefinitionKey`. Fields with `<camunda:property id="readonly"
 * value="true">` are marked as readonly.
 */
export function extractEmbeddedFormFields(
  bpmnXml: string,
  taskDefinitionKey: string,
): TaskFormField[] {
  // Find the user task block
  const blockRe = new RegExp(
    `<(?:[\\w]+:)?userTask\\b[^>]*\\bid="${escapeRegex(taskDefinitionKey)}"[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?userTask>`,
    "m",
  )
  const blockMatch = bpmnXml.match(blockRe)
  if (!blockMatch) return []
  const taskBlock = blockMatch[1] ?? ""

  // Find the formData block within the task
  const formDataMatch = taskBlock.match(
    /<(?:[\w]+:)?formData\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?formData>/,
  )
  if (!formDataMatch) return []
  const formDataBlock = formDataMatch[1] ?? ""

  // Parse individual formField elements (self-closing and block)
  const fields: TaskFormField[] = []
  const fieldBlockRe = /<(?:[\w]+:)?formField\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w]+:)?formField>)/g

  for (const match of formDataBlock.matchAll(fieldBlockRe)) {
    const attrs = match[1] ?? ""
    const inner = match[2] ?? ""

    const id = readAttr(attrs, "id")
    if (!id) continue

    const label = readAttr(attrs, "label") ?? undefined
    const rawType = readAttr(attrs, "type") ?? undefined
    const type = rawType ? (CAMUNDA_TYPE_MAP[rawType.toLowerCase()] ?? rawType) : undefined

    // Check for readonly custom property
    const readonly = /camunda:property\b[^>]*\bid="readonly"[^>]*\bvalue="true"/.test(inner)

    // Parse <camunda:values> for suggestedValues
    const suggestedValues: string[] = []
    const valuesBlockMatch = inner.match(
      /<(?:[\w]+:)?values\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?values>/,
    )
    if (valuesBlockMatch) {
      const valueRe = /<(?:[\w]+:)?value\b([^>]*?)\/>/g
      for (const vm of (valuesBlockMatch[1] ?? "").matchAll(valueRe)) {
        const name = readAttr(vm[1] ?? "", "name")
        if (name) suggestedValues.push(name)
      }
    }

    fields.push({
      name: id,
      label,
      type,
      readonly: readonly || undefined,
      suggestedValues: suggestedValues.length > 0 ? suggestedValues : undefined,
      source: "form-data",
    })
  }

  return fields
}

function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`)
  const match = attrs.match(re)
  return match ? match[1] : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Identifier on either side, value on the other. Dotted identifiers like
// `customer.segment` are matched by the regex but dropped below — we
// can't set nested object paths via a flat task variable, so we'd lie to
// the user about what their button click does.
const COMPARISON_RE =
  /([A-Za-z_$][\w$.]*)\s*(?:==|!=|<=?|>=?)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false|-?\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|true|false|-?\d+(?:\.\d+)?)\s*(?:==|!=|<=?|>=?)\s*([A-Za-z_$][\w$.]*)/g

export function parseConditionExpression(expr: string): InferredCondition[] {
  const stripped = expr.replace(/^\s*\$\{\s*/, "").replace(/\s*\}\s*$/, "")
  const conditions: InferredCondition[] = []
  for (const match of stripped.matchAll(COMPARISON_RE)) {
    const variable = match[1] ?? match[4]
    const rawValue = match[2] ?? match[3]
    if (!variable || !rawValue) continue
    if (variable.includes(".")) continue
    const literal = parseLiteral(rawValue)
    if (literal) conditions.push({ variable, literal })
  }
  return conditions
}

function parseLiteral(raw: string): ConditionLiteral | null {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1).replace(/\\(.)/g, "$1")
    return { value: inner, type: "String" }
  }
  if (trimmed === "true" || trimmed === "false") {
    return { value: trimmed === "true", type: "Boolean" }
  }
  if (/^-?\d+$/.test(trimmed)) {
    return { value: Number(trimmed), type: "Long" }
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return { value: Number(trimmed), type: "Double" }
  }
  return null
}
