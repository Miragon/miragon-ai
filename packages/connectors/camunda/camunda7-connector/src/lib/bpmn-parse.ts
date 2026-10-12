/**
 * Light-weight BPMN 2.0 XML parsers for widget data layers. These are
 * "best-effort" — they avoid pulling in `bpmn-moddle` server-side and rely
 * on regex over machine-generated XML, which is reliable enough for the
 * data shapes we need (activity counts). Display NAMES are not read here:
 * every module reads them by the one rule, the kit's `readBpmnNames` /
 * `parseBpmnNames` (`@miragon-ai/widget-shell/server`), so camunda7 and
 * analytics never name the same process or activity differently.
 */

/**
 * The ids of the diagram's BPMN activity-like elements (tasks, gateways,
 * events, sub-processes, call activities), in document order. The "X / Y
 * activities affected" hint counts both sides over THIS set, so an activity
 * only an older version has never inflates X.
 */
export function bpmnActivityIds(bpmnXml: string): string[] {
  const re = /<(?:[a-zA-Z]+:)?(?:\w+Task|\w+Gateway|\w+Event|subProcess|callActivity)\b[^>]*>/g
  const ids: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(bpmnXml)) !== null) {
    const id = /\bid="([^"]+)"/.exec(m[0])
    if (id) ids.push(id[1])
  }
  return ids
}
