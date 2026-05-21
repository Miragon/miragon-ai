/**
 * Light-weight BPMN 2.0 XML parsers for widget data layers. These are
 * "best-effort" — they avoid pulling in `bpmn-moddle` server-side and rely
 * on regex over machine-generated XML, which is reliable enough for the
 * data shapes we need (display names, activity counts).
 */

const XML_ENTITY_MAP: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&(?:lt|gt|quot|apos|#39);/g, (m) => XML_ENTITY_MAP[m]).replace(/&amp;/g, "&")
}

/**
 * Walks all opening tags with both `id` and `name` attributes and returns
 * a `{ id → display name }` map. Skips entries with empty names. Robust
 * enough for machine-generated BPMN; falls back to ID display when a name
 * is missing.
 */
export function extractActivityNames(bpmnXml: string): Record<string, string> {
  const names: Record<string, string> = {}
  const tagRe = /<[a-zA-Z][^>]*>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(bpmnXml)) !== null) {
    const inner = m[0]
    const idMatch = /\bid="([^"]+)"/.exec(inner)
    const nameMatch = /\bname="([^"]*)"/.exec(inner)
    if (idMatch && nameMatch && nameMatch[1].length > 0) {
      names[idMatch[1]] = decodeXmlEntities(nameMatch[1])
    }
  }
  return names
}

/**
 * Counts BPMN activity-like elements (tasks, gateways, events, sub-processes,
 * call activities). Used for "X / Y activities affected" hints.
 */
export function countBpmnActivities(bpmnXml: string): number {
  const re = /<(?:[a-zA-Z]+:)?(?:\w+Task|\w+Gateway|\w+Event|subProcess|callActivity)\b/g
  let count = 0
  while (re.exec(bpmnXml) !== null) count++
  return count
}
