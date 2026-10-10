import { BpmnHeatmapWidget, type BpmnHeatmapData } from "@miragon-ai/widget-shell/widgets"

import { useT } from "../messages/use-t.js"

/**
 * The analytics heatmap payload (`analytics_show_bpmn_heatmap` and its
 * `analytics_bpmn_heatmap_data` feed): the shell's heatmap data plus the
 * configured engines its frequency/duration values add up, so the model
 * description names the scope like every other analytics view.
 */
export interface AnalyticsBpmnHeatmapData extends BpmnHeatmapData {
  engines: string[]
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
      labels={{
        title: t("aHeatmap.title"),
        window: t("aHeatmap.window"),
        frequency: t("aHeatmap.frequency"),
        duration: t("aHeatmap.duration"),
        frequencyLegend: t("aHeatmap.frequencyLegend"),
        durationLegend: t("aHeatmap.durationLegend"),
        noData: t("aHeatmap.noData"),
        noHeat: t("aHeatmap.noHeat"),
        bpmnUnavailable: t("aHeatmap.bpmnUnavailable"),
        less: t("aHeatmap.less"),
        more: t("aHeatmap.more"),
        diagramAriaLabel: t("aHeatmap.diagramAria"),
        errorTitle: t("aHeatmap.errorTitle"),
      }}
    />
  )
}
