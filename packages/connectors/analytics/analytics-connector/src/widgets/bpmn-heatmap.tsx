import {
  BpmnHeatmapWidget,
  ViewMeta,
  formatLookback,
  type BpmnHeatmapData,
} from "@miragon-ai/widget-shell/widgets"

import type { BpmnMissingReason } from "../heatmap-data.js"
import { useT } from "../messages/use-t.js"
import { enginesMeta } from "./view-meta.js"

/**
 * The analytics heatmap payload (`analytics_show_bpmn_heatmap` and its
 * `analytics_bpmn_heatmap_data` feed): the shell's heatmap data plus the
 * configured engines its frequency/duration values add up, so the model
 * description and the meta line name the scope like every other analytics
 * view, and when the values were read.
 */
export interface AnalyticsBpmnHeatmapData extends BpmnHeatmapData {
  engines: string[]
  /** When the heat values were read (ISO); absent in payloads recorded before it existed. */
  asOf?: string
  /**
   * Why `bpmnXml` is null, as the server knows it (`heatmap-data.ts`). Absent
   * with a diagram and in payloads recorded before it existed.
   */
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
export function AnalyticsBpmnHeatmap({ data }: { data: AnalyticsBpmnHeatmapData | null }) {
  const t = useT()
  return (
    <BpmnHeatmapWidget
      data={data}
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
        bpmnUnavailable: t(bpmnMissingKey(data)),
        less: t("aHeatmap.less"),
        more: t("aHeatmap.more"),
        diagramAriaLabel: t("aHeatmap.diagramAria"),
        errorTitle: t("aHeatmap.errorTitle"),
        errorHint: t("aHeatmap.errorHint"),
      }}
    />
  )
}
