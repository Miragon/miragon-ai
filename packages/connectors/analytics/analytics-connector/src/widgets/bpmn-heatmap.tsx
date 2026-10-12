import { Skeleton, useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  BpmnHeatmapWidget,
  QueryFallback,
  ViewMeta,
  formatLookback,
  type BpmnHeatmapData,
} from "@miragon-ai/widget-shell/widgets"

import type { BpmnMissingReason } from "../heatmap-data.js"
import { useT } from "../messages/use-t.js"
import { ANALYTICS_BPMN_XML_DATA } from "../tool-names.js"
import { enginesMeta } from "./view-meta.js"

/**
 * The analytics heatmap payload (`analytics_show_bpmn_heatmap`): the heat
 * values plus the configured engines they add up, so the model description
 * and the meta line name the scope like every other analytics view, and when
 * the values were read. The diagram is NOT in it: the widget reads it from
 * `analytics_bpmn_xml_data`, so the model never sees the XML.
 */
export interface AnalyticsBpmnHeatmapData extends Omit<BpmnHeatmapData, "bpmnXml"> {
  engines: string[]
  /** When the heat values were read (ISO); absent in payloads recorded before it existed. */
  asOf?: string
  /**
   * Why there is no diagram, as the server knows it (`heatmap-data.ts`).
   * Absent when a diagram exists (the widget then reads it).
   */
  bpmnMissing?: BpmnMissingReason
}

/** `analytics_bpmn_xml_data`: the key's latest diagram, or why there is none. */
interface HeatmapDiagram {
  bpmnXml: string | null
  bpmnMissing?: BpmnMissingReason
}

/**
 * The "no diagram" text per known cause. An absent or unknown cause gets the
 * text that names none: the widget never guesses why the diagram is missing.
 */
const BPMN_MISSING_KEY: Record<BpmnMissingReason, string> = {
  "no-camunda7": "aHeatmap.bpmnNoCamunda7",
  "not-loaded": "aHeatmap.bpmnNotLoaded",
}

/** The catalog key of the "no diagram" text for a payload. */
function bpmnMissingKey(data: Pick<AnalyticsBpmnHeatmapData, "bpmnMissing"> | null) {
  const reason = data?.bpmnMissing
  return reason && Object.hasOwn(BPMN_MISSING_KEY, reason)
    ? BPMN_MISSING_KEY[reason]
    : "aHeatmap.bpmnUnavailable"
}

/**
 * Analytics-side wrapper that localizes the shared shell heatmap. The shell
 * carries no module i18n — every string arrives via `labels` — so this binds
 * `useT()` to the component. Registered under `analytics:bpmn-heatmap` in
 * `widgets/index.ts` in place of the raw shell widget.
 */
/**
 * The heatmap's data with its diagram: read from `analytics_bpmn_xml_data`
 * unless the server said why there is none, scoped to the engines whose heat
 * the view shows. `pending` while the read is out (or failed).
 */
function useHeatmapWithDiagram(data: AnalyticsBpmnHeatmapData | null) {
  const hasDiagram = data !== null && data.bpmnMissing === undefined
  const diagram = useToolQuery<HeatmapDiagram>(
    ["analytics:bpmn-xml", data?.processDefinitionKey ?? null, data?.engines ?? null],
    ANALYTICS_BPMN_XML_DATA,
    { processDefinitionKey: data?.processDefinitionKey ?? "", engine: data?.engines },
    { enabled: hasDiagram },
  )
  const full: (BpmnHeatmapData & Pick<AnalyticsBpmnHeatmapData, "bpmnMissing">) | null = data && {
    ...data,
    bpmnXml: diagram.data?.bpmnXml ?? null,
    bpmnMissing: data.bpmnMissing ?? diagram.data?.bpmnMissing,
  }
  return { diagram, pending: hasDiagram && !diagram.data, full }
}

export function AnalyticsBpmnHeatmap({ data }: { data: AnalyticsBpmnHeatmapData | null }) {
  const t = useT()
  const { diagram, pending, full } = useHeatmapWithDiagram(data)
  if (pending) {
    return (
      <QueryFallback
        isError={diagram.isError}
        error={diagram.error}
        onRetry={() => void diagram.refetch()}
        errorTitle={t("aHeatmap.errorTitle")}
        skeleton={<Skeleton className="h-60 w-full rounded-md" />}
      />
    )
  }
  return (
    <BpmnHeatmapWidget
      data={full}
      meta={
        data && (
          <ViewMeta
            period={formatLookback(data.period)}
            engines={enginesMeta(data.engines)}
            asOf={data.asOf}
          />
        )
      }
      labels={{
        title: t("aHeatmap.title"),
        window: t("aHeatmap.window"),
        frequency: t("aHeatmap.frequency"),
        duration: t("aHeatmap.duration"),
        frequencyLegend: t("aHeatmap.frequencyLegend"),
        durationLegend: t("aHeatmap.durationLegend"),
        noData: t("aHeatmap.noData"),
        noHeat: t("aHeatmap.noHeat"),
        bpmnUnavailable: t(bpmnMissingKey(full)),
        less: t("aHeatmap.less"),
        more: t("aHeatmap.more"),
        diagramAriaLabel: t("aHeatmap.diagramAria"),
        errorTitle: t("aHeatmap.errorTitle"),
        errorHint: t("aHeatmap.errorHint"),
      }}
    />
  )
}
