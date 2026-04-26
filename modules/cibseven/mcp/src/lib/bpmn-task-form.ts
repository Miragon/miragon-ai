/**
 * Best-effort BPMN parser that derives expected task-completion variables from
 * the structure of a process. Two questions it answers for a given user task:
 *
 *   1. Which sequence flows leave the task (directly or via a downstream
 *      gateway)?
 *   2. Which variables and concrete values are referenced in those flows'
 *      `<conditionExpression>` elements?
 *
 * The output feeds the support UI's task-completion form so the operator can
 * pick "positive"/"negative" buttons for `decision`, instead of guessing the
 * variable name. Same regex-only style as `bpmn-parse.ts` — no `bpmn-moddle`
 * dependency on the server.
 */
import type { TaskFormField } from "@miragon-ai/client-cibseven"

interface SequenceFlow {
  id: string
  sourceRef: string
  targetRef: string
  conditionExpression: string | null
}

interface ConditionLiteral {
  value: unknown
  type: "String" | "Boolean" | "Long" | "Double"
}

interface InferredCondition {
  variable: string
  literal: ConditionLiteral
}

export function inferTaskFormFieldsFromBpmn(
  bpmnXml: string,
  taskDefinitionKey: string,
): TaskFormField[] {
  const flows = parseSequenceFlows(bpmnXml)
  const flowsById = new Map(flows.map((f) => [f.id, f]))
  const gatewayIds = parseGatewayIds(bpmnXml)
  const userTaskOutgoing = parseElementOutgoing(bpmnXml, taskDefinitionKey)

  const conditions: InferredCondition[] = []

  for (const flowId of userTaskOutgoing) {
    const flow = flowsById.get(flowId)
    if (!flow) continue
    if (flow.conditionExpression) {
      conditions.push(...parseConditionExpression(flow.conditionExpression))
    }
    if (gatewayIds.has(flow.targetRef)) {
      for (const gOut of parseElementOutgoing(bpmnXml, flow.targetRef)) {
        const gFlow = flowsById.get(gOut)
        if (!gFlow?.conditionExpression) continue
        conditions.push(...parseConditionExpression(gFlow.conditionExpression))
      }
    }
  }

  const grouped = new Map<string, ConditionLiteral[]>()
  for (const cond of conditions) {
    const list = grouped.get(cond.variable) ?? []
    if (!list.some((existing) => sameLiteral(existing, cond.literal))) {
      list.push(cond.literal)
    }
    grouped.set(cond.variable, list)
  }

  const fields: TaskFormField[] = []
  for (const [variable, literals] of grouped) {
    fields.push({
      name: variable,
      type: literals[0]?.type,
      suggestedValues: literals.map((l) => l.value),
      source: "inferred-from-gateway",
    })
  }
  return fields
}

function sameLiteral(a: ConditionLiteral, b: ConditionLiteral): boolean {
  return a.type === b.type && a.value === b.value
}

const SEQ_FLOW_SELF_RE = /<(?:[\w]+:)?sequenceFlow\b([^>]*?)\/>/g
const SEQ_FLOW_BLOCK_RE =
  /<(?:[\w]+:)?sequenceFlow\b([^>]*?)(?<!\/)>([\s\S]*?)<\/(?:[\w]+:)?sequenceFlow>/g

function parseSequenceFlows(bpmnXml: string): SequenceFlow[] {
  const flows: SequenceFlow[] = []
  for (const match of bpmnXml.matchAll(SEQ_FLOW_SELF_RE)) {
    const flow = buildFlow(match[1] ?? "", "")
    if (flow) flows.push(flow)
  }
  for (const match of bpmnXml.matchAll(SEQ_FLOW_BLOCK_RE)) {
    const flow = buildFlow(match[1] ?? "", match[2] ?? "")
    if (flow) flows.push(flow)
  }
  return flows
}

function buildFlow(attrs: string, inner: string): SequenceFlow | null {
  const id = readAttr(attrs, "id")
  const sourceRef = readAttr(attrs, "sourceRef")
  const targetRef = readAttr(attrs, "targetRef")
  if (!id || !sourceRef || !targetRef) return null
  const conditionMatch = inner.match(
    /<(?:[\w]+:)?conditionExpression[^>]*>([\s\S]*?)<\/(?:[\w]+:)?conditionExpression>/,
  )
  const conditionExpression = conditionMatch ? decodeXml(conditionMatch[1].trim()) : null
  return { id, sourceRef, targetRef, conditionExpression }
}

function parseGatewayIds(bpmnXml: string): Set<string> {
  const ids = new Set<string>()
  const gatewayRe = /<(?:[\w]+:)?(?:exclusiveGateway|inclusiveGateway|complexGateway)\b([^>]*)/g
  for (const match of bpmnXml.matchAll(gatewayRe)) {
    const id = readAttr(match[1] ?? "", "id")
    if (id) ids.add(id)
  }
  return ids
}

function parseElementOutgoing(bpmnXml: string, elementId: string): string[] {
  const blockRe = new RegExp(
    `<(?:[\\w]+:)?(\\w+)\\b([^>]*\\bid="${escapeRegex(elementId)}"[^>]*)>([\\s\\S]*?)<\\/(?:[\\w]+:)?\\1>`,
    "m",
  )
  const match = bpmnXml.match(blockRe)
  if (!match) return []
  const inner = match[3]
  const outgoingRe = /<(?:[\w]+:)?outgoing>([^<]+)<\/(?:[\w]+:)?outgoing>/g
  const result: string[] = []
  for (const outMatch of inner.matchAll(outgoingRe)) {
    const ref = outMatch[1]?.trim()
    if (ref) result.push(ref)
  }
  return result
}

function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}="([^"]*)"`)
  const match = attrs.match(re)
  return match ? match[1] : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
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
