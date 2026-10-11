/**
 * Why a heatmap payload carries no diagram (`bpmnXml: null`), set by the
 * server that knows it, so the widget names the known cause and never guesses
 * one. Shared by `widget-tools.ts` (server) and `widgets/bpmn-heatmap.tsx`
 * (widget bundle), so it lives outside both.
 *
 * - `no-camunda7`: the server got no BPMN lookup. Analytics loads diagrams
 *   only through the camunda7 module, which is not active.
 * - `not-loaded`: the lookup ran and returned nothing. camunda7 reads the
 *   diagram from its FIRST configured engine (`createBpmnXmlFetcher`), which
 *   was unreachable, or the process is not deployed there.
 */
export type BpmnMissingReason = "no-camunda7" | "not-loaded"
