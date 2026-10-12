/**
 * THE rule every module names a BPMN process and its elements by (#322 U13):
 * one reader for the server (no DOM) and the browser alike, so camunda7,
 * analytics and the kit's heatmap never give the same process or activity two
 * different names. The Camunda Modeler names the POOL of a collaboration and
 * leaves the process unnamed, and it writes a line break, `&`, `"`, `<` or
 * `>` in a name as a character reference (`&#10;`, `&#38;` …): a reader that
 * knew only the process element or only the five named entities would show
 * the key or the raw reference instead.
 */

/** The names one model gives one process: its own (or its pool's) and the elements that have one. */
export interface BpmnNames {
  /** The process's own name, else the name of the pool that holds it; null when neither has one. */
  name: string | null
  /** Element id → name, only for elements that carry a name (no process, no pool). */
  elements: Record<string, string>
}

/** Every name one model gives, for a caller that does not yet know which process it asks about. */
export interface BpmnModelNames {
  /** Process id → its name by the {@link BpmnNames.name} rule (own name, else its pool's). */
  processes: Record<string, string>
  /** Element id → name, only for elements that carry a name (no process, no pool). */
  elements: Record<string, string>
}

/** A start tag: prefix, local name, and its attributes (a quoted value may hold `>`). */
const START_TAG =
  /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g
const ATTRIBUTE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

/** A numeric character reference's character; one past Unicode stays as written. */
const character = (code: number, written: string) =>
  code <= 0x10ffff ? String.fromCodePoint(code) : written

/** An attribute value as text: entities decoded, line breaks and runs of space folded. */
function attributeText(raw: string): string {
  return raw
    .replace(
      /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi,
      (match: string, hex?: string, dec?: string, named?: string) => {
        if (hex) return character(Number.parseInt(hex, 16), match)
        if (dec) return character(Number.parseInt(dec, 10), match)
        return ENTITIES[(named ?? "").toLowerCase()] ?? match
      },
    )
    .replace(/\s+/g, " ")
    .trim()
}

function attributesOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(ATTRIBUTE)) out[m[1]] = m[2] ?? m[3] ?? ""
  return out
}

/**
 * Every name in one BPMN 2.0 XML document, read without a DOM: each
 * `<process id=… name=…>` (or, when the process has no name, the name of the
 * pool — `<participant processRef=…>` — that holds it) and every other
 * element with an `id` and a non-empty `name`. Comments and CDATA are
 * skipped, any namespace prefix is accepted. A document that is not BPMN
 * yields no names, never an error.
 */
export function readBpmnNames(xml: string): BpmnModelNames {
  const text = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  const own: Record<string, string> = {}
  const pools: Record<string, string> = {}
  const elements: Record<string, string> = {}
  for (const m of text.matchAll(START_TAG)) {
    const local = m[1]
    const attrs = attributesOf(m[2] ?? "")
    const name = attrs.name === undefined ? "" : attributeText(attrs.name)
    if (local === "participant") {
      if (attrs.processRef && name) pools[attrs.processRef] = name
      continue
    }
    if (!attrs.id || !name) continue
    if (local === "process") {
      own[attrs.id] = name
      continue
    }
    elements[attrs.id] = name
  }
  return { processes: { ...pools, ...own }, elements }
}

/** The name {@link readBpmnNames} found for process `processDefinitionKey`, or null. */
export function bpmnProcessNameOf(
  names: BpmnModelNames,
  processDefinitionKey: string,
): string | null {
  return Object.hasOwn(names.processes, processDefinitionKey)
    ? names.processes[processDefinitionKey]
    : null
}

/**
 * The names of process `processDefinitionKey` in one BPMN 2.0 XML document:
 * its own name (else its pool's) and every named element
 * ({@link readBpmnNames}).
 */
export function parseBpmnNames(xml: string, processDefinitionKey: string): BpmnNames {
  const names = readBpmnNames(xml)
  return { name: bpmnProcessNameOf(names, processDefinitionKey), elements: names.elements }
}
