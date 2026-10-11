import { useMemo, useState, type ReactNode } from "react"
import {
  Badge,
  Card,
  CardContent,
  cn,
  FOCUS_RING,
  useLocale,
  WidgetHeader,
} from "@miragon/mcp-toolkit-ui"
import { ChevronRight } from "lucide-react"
import { BpmnHeatmap, HeatmapLegend } from "./bpmn-heatmap.js"
import { bpmnElementNames, heatRange } from "./bpmn-heatmap/heat-utils.js"
import { DEFAULT_HEATMAP_LABELS, type BpmnHeatmapLabels } from "./bpmn-heatmap-labels.js"
import { formatDuration, formatNumber } from "./format.js"
import { Icon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { ListTable } from "./list-table.js"
import { SegmentedControl } from "./segmented-control.js"
import { TableEmptyState, Td } from "./table.js"

export interface BpmnHeatmapData {
  processDefinitionKey: string
  bpmnXml: string | null
  period: string
  /** Per-element execution count over the window, keyed by activity id. */
  frequency: Record<string, number>
  /** Per-element average duration in seconds over the window, keyed by activity id. */
  durationSec: Record<string, number>
}

type Mode = "frequency" | "duration"

/** A heat value in the mode's unit: a count, or a duration ("3m 7s" / "3 Min. 7 s"). */
function formatHeat(mode: Mode, value: number): string {
  return mode === "frequency" ? formatNumber(value) : formatDuration(value * 1000)
}

/**
 * The values behind the colours (U16): every element with a value above
 * zero, largest first, under a disclosure below the diagram — the number a
 * colour cannot say, for everyone, and the heatmap's text alternative.
 */
export function HeatValuesTable({
  bpmnXml,
  values,
  format,
  labels,
}: {
  bpmnXml: string
  values: Record<string, number>
  format: (value: number) => string
  labels?: Pick<BpmnHeatmapLabels, "valuesTable" | "elementColumn" | "valueColumn">
}) {
  const kit = kitLabels(useLocale())
  const names = useMemo(() => bpmnElementNames(bpmnXml), [bpmnXml])
  const rows = Object.entries(values)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort(([, a], [, b]) => b - a)
  if (rows.length === 0) return null
  const title = labels?.valuesTable ?? kit.heatmapValues
  return (
    <details className="group">
      <summary
        className={cn(
          "text-dense flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm font-medium [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <Icon
          icon={ChevronRight}
          className="text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {title}
      </summary>
      <div className="mt-2">
        <ListTable
          ariaLabel={title}
          columns={[
            { label: labels?.elementColumn ?? kit.heatmapElement },
            { label: labels?.valueColumn ?? kit.heatmapValue, align: "right" },
          ]}
        >
          {rows.map(([id, value]) => (
            <tr key={id}>
              <Td>
                {names[id] ?? <span className="font-mono">{id}</span>}
                {names[id] && (
                  <span className="text-muted-foreground text-small ml-2 font-mono">{id}</span>
                )}
              </Td>
              <Td align="right" className="tabular-nums">
                {format(value)}
              </Td>
            </tr>
          ))}
        </ListTable>
      </div>
    </details>
  )
}

/**
 * Data-widget wrapper: one BPMN diagram, a Frequency↔Duration switch that
 * swaps the per-element heat values (both fetched up front), the legend with
 * the smallest and largest value, and the values as a table. Node-only —
 * metrics carry no per-instance path data, so sequence flows are not heated.
 */
export function BpmnHeatmapWidget({
  data,
  labels,
  meta,
}: {
  data: BpmnHeatmapData | null
  labels?: BpmnHeatmapLabels
  /**
   * The view's reference frame under the title (a `ViewMeta`: period,
   * engines, as-of time). Replaces the period badge, whose period it carries.
   */
  meta?: ReactNode
}) {
  const [mode, setMode] = useState<Mode>("frequency")
  const kit = kitLabels(useLocale())
  const l = { ...DEFAULT_HEATMAP_LABELS, ...labels }

  if (!data) return <TableEmptyState>{l.noData}</TableEmptyState>
  if (!data.bpmnXml) return <TableEmptyState>{l.bpmnUnavailable}</TableEmptyState>

  const values = mode === "frequency" ? data.frequency : data.durationSec
  const legendLabel = mode === "frequency" ? l.frequencyLegend : l.durationLegend
  const range = heatRange(values)
  const format = (value: number) => formatHeat(mode, value)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <WidgetHeader
          as="h2"
          title={l.title}
          titleSuffix={
            <Badge variant="outline" className="ml-2 align-middle font-mono">
              {data.processDefinitionKey}
            </Badge>
          }
          sub={
            meta ?? (
              <span>
                {l.window} {data.period}
              </span>
            )
          }
          actions={
            <SegmentedControl<Mode>
              ariaLabel={labels?.modeAriaLabel ?? kit.heatmapMetric}
              value={mode}
              onChange={setMode}
              options={[
                { value: "frequency", label: l.frequency },
                { value: "duration", label: l.duration },
              ]}
            />
          }
        />

        <BpmnHeatmap
          bpmnXml={data.bpmnXml}
          nodeFrequencies={values}
          diagramAriaLabel={l.diagramAriaLabel}
          errorTitle={l.errorTitle}
          errorHint={l.errorHint}
          noHeatLabel={l.noHeat}
        />

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-small">{legendLabel}</span>
          <HeatmapLegend
            lessLabel={l.less}
            moreLabel={l.more}
            min={range ? format(range.min) : undefined}
            max={range ? format(range.max) : undefined}
          />
        </div>
        <HeatValuesTable bpmnXml={data.bpmnXml} values={values} format={format} labels={labels} />
      </CardContent>
    </Card>
  )
}
