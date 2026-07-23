import { BpmnHeatmapWidget, type BpmnHeatmapData } from "@miragon-ai/widget-shell/widgets"

import { useT } from "../messages/use-t.js"

/**
 * Analytics-side wrapper that localizes the shared shell heatmap. The shell
 * carries no module i18n — every string arrives via `labels` — so this binds
 * `useT()` to the component. Registered under `analytics:bpmn-heatmap` in
 * `widgets/index.ts` in place of the raw shell widget.
 */
export function AnalyticsBpmnHeatmap({ data }: { data: BpmnHeatmapData | null }) {
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
        bpmnUnavailable: t("aHeatmap.bpmnUnavailable"),
        less: t("aHeatmap.less"),
        more: t("aHeatmap.more"),
        diagramAriaLabel: t("aHeatmap.diagramAria"),
        errorTitle: t("aHeatmap.errorTitle"),
      }}
    />
  )
}
