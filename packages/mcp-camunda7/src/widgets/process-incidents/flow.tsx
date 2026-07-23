import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  BpmnHeatmap,
  HeatmapLegend,
  SectionHeading,
  SegmentedControl,
  ViewDataState,
  WidgetShell,
  type BpmnHeatmapData,
  type SegmentedControlOption,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessIncidentsData } from "../../view-models.js"
import { BpmnDiagram, type BpmnHighlight } from "../bpmn-diagram.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

type FlowMode = "incidents" | "frequency" | "duration"

const DIAGRAM_HEIGHT = 460

/**
 * Lazily loads the execution heatmap (Prometheus metrics via the analytics
 * module's plain data feed) and paints it on the definition diagram. Mounted
 * only when the operator switches the mode toggle off "Incidents", so the
 * metrics query never runs on first paint. `mode` swaps frequency↔duration
 * without refetching (both come in one payload).
 *
 * Graceful degradation (architecture invariant 8): the tool name is a raw
 * string, not an import — when the analytics module is absent the call fails
 * and `onUnavailable` tells the parent to hide the heatmap modes with a hint
 * instead of rendering an error.
 */
function ProcessHeatmap({
  processDefinitionKey,
  engine,
  mode,
  onUnavailable,
}: {
  processDefinitionKey: string
  engine?: string
  mode: "frequency" | "duration"
  onUnavailable: () => void
}) {
  const t = useT()
  const q = useToolQuery<BpmnHeatmapData>(
    // Engine + definition key stay in the query key — without them the cache
    // would leak one definition's (or engine's) heatmap into another's view.
    ["camunda7:heatmap", engine ?? null, processDefinitionKey],
    "analytics_bpmn_heatmap_data",
    { processDefinitionKey, period: "30d", engine },
  )
  const unavailable = q.isError
  useEffect(() => {
    if (unavailable) onUnavailable()
  }, [unavailable, onUnavailable])
  if (unavailable) return null
  if (!q.data) {
    return (
      <div className="text-muted-foreground p-6 text-sm">{t("procIncFlow.heatmapLoading")}</div>
    )
  }
  if (!q.data.bpmnXml) {
    return (
      <Alert>
        <AlertDescription>{t("procIncFlow.heatmapNoDiagram")}</AlertDescription>
      </Alert>
    )
  }
  const values = mode === "frequency" ? q.data.frequency : q.data.durationSec
  return <BpmnHeatmap bpmnXml={q.data.bpmnXml} nodeFrequencies={values} height={DIAGRAM_HEIGHT} />
}

/**
 * The one BPMN widget of the unified definition view. Three modes behind a
 * kit SegmentedControl: "incidents" (live incident overlays from the shared
 * feed) plus the "frequency"/"duration" execution heatmap (analytics metrics,
 * fetched lazily). `initialMode` is the entry point's focus lever.
 */
export function ProcessDefinitionFlow({
  data: initialData = null,
  processDefinitionKey,
  engine,
  initialMode = "incidents",
}: {
  data?: ProcessIncidentsData | null
  processDefinitionKey?: string
  engine?: string
  initialMode?: "incidents" | "frequency"
}) {
  const t = useT()
  const { data, loading, error } = useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey, engine },
    !!processDefinitionKey,
  )
  const [mode, setMode] = useState<FlowMode>(initialMode)
  const [heatmapUnavailable, setHeatmapUnavailable] = useState(false)
  const markHeatmapUnavailable = useCallback(() => setHeatmapUnavailable(true), [])
  // Analytics absent → fall back to the incident overlays; the two heatmap
  // mode buttons disappear (with a hint), never an error surface.
  useEffect(() => {
    if (heatmapUnavailable) setMode("incidents")
  }, [heatmapUnavailable])

  const highlights = useMemo<BpmnHighlight[]>(() => {
    const activities = data?.activities ?? []
    return [
      {
        kind: "incident",
        activityIds: activities.map((a) => a.activityId),
        counts: activities.map((a) => ({ activityId: a.activityId, count: a.incidentCount })),
      },
    ]
  }, [data?.activities])

  if (!data) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={error}
          loadingText={t("procIncFlow.loading")}
          emptyText={t("procIncFlow.noDataAvailable")}
        />
      </WidgetShell>
    )
  }

  const affectedActivityCount = data.activities.length

  const modeOptions: SegmentedControlOption<FlowMode>[] = heatmapUnavailable
    ? [{ value: "incidents", label: t("procIncFlow.modeIncidents") }]
    : [
        { value: "incidents", label: t("procIncFlow.modeIncidents") },
        { value: "frequency", label: t("procIncFlow.modeFrequency") },
        { value: "duration", label: t("procIncFlow.modeDuration") },
      ]

  return (
    <WidgetShell>
      <section>
        <SectionHeading
          title={t("procIncFlow.title")}
          hint={
            data.totalActivityCount !== null
              ? t("procIncFlow.hintOfTotal", {
                  count: affectedActivityCount,
                  total: data.totalActivityCount,
                })
              : affectedActivityCount === 1
                ? t("procIncFlow.hintSingular", { count: affectedActivityCount })
                : t("procIncFlow.hintPlural", { count: affectedActivityCount })
          }
        />
        {data.bpmnXml ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl<FlowMode>
                options={modeOptions}
                value={mode}
                onChange={setMode}
                ariaLabel={t("procIncFlow.modeAria")}
              />
              {heatmapUnavailable ? (
                <span className="text-muted-foreground text-xs">
                  {t("procIncFlow.heatmapUnavailable")}
                </span>
              ) : mode !== "incidents" ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {mode === "frequency"
                      ? t("procIncFlow.heatmapCaptionFrequency")
                      : t("procIncFlow.heatmapCaptionDuration")}
                  </span>
                  <HeatmapLegend />
                </div>
              ) : null}
            </div>
            {mode === "incidents" ? (
              <BpmnDiagram bpmnXml={data.bpmnXml} height={DIAGRAM_HEIGHT} highlights={highlights} />
            ) : (
              <ProcessHeatmap
                processDefinitionKey={data.processDefinitionKey}
                // Keep the metrics scoped to the engine this view shows —
                // without it the feed aggregates across the whole fleet.
                engine={engine ?? data.engineId}
                mode={mode}
                onUnavailable={markHeatmapUnavailable}
              />
            )}
          </>
        ) : (
          <Alert>
            <AlertDescription>{t("procIncFlow.noBpmnDiagram")}</AlertDescription>
          </Alert>
        )}
      </section>
    </WidgetShell>
  )
}
