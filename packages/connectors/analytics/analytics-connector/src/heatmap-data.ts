/**
 * Why a heatmap payload carries no diagram (`bpmnXml: null`), set by the
 * server that knows it, so the widget names the known cause and never guesses
 * one. Shared by `widget-tools.ts` (server) and `widgets/bpmn-heatmap.tsx`
 * (widget bundle), so it lives outside both.
 *
 * - `no-camunda7`: the server got no BPMN lookup. Analytics loads diagrams
 *   only through the camunda7 module, which is not active.
 * - `not-loaded`: the lookup ran and returned nothing. It asks the engines of
 *   the view in configuration order (`createBpmnXmlFetcher` reads each one),
 *   and none of them answered with the model: unreachable, or the process is
 *   not deployed on them.
 */
export type BpmnMissingReason = "no-camunda7" | "not-loaded"
